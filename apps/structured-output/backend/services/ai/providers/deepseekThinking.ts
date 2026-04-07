import { AIMessage, AIMessageChunk, BaseMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { z } from "zod";
import { getMessageText } from "@common/utils/messageContent";
import type { SendEvent } from "@backend/types";
import { uuid } from "@backend/utils/uuid.js";
import { finalizeAiMessage, sendAiChunkEvent } from "../../chat/aiMessageStream.js";
import { getConfiguredBaseUrl, getConfiguredModelName, isDeepSeekReasonerModel, type ModelRuntimeOptions } from "../providerConfig.js";
import { registeredTools } from "../tools/index.js";

type DeepSeekToolDelta = {
    id?: string;
    index?: number;
    type?: string;
    function?: {
        name?: string;
        arguments?: string;
    };
};

type DeepSeekStreamChunk = {
    id?: string;
    model?: string;
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        completion_tokens_details?: {
            reasoning_tokens?: number;
        };
    };
    choices?: Array<{
        delta?: {
            role?: string;
            content?: string | null;
            reasoning_content?: string | null;
            tool_calls?: DeepSeekToolDelta[];
        };
    }>;
};

type DeepSeekRequestMessage = {
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    tool_call_id?: string;
    tool_calls?: Array<{
        id?: string;
        type: "function";
        function: {
            name: string;
            arguments: string;
        };
    }>;
    reasoning_content?: string;
};

function getReasoningContent(message: BaseMessage) {
    const reasoningContent = (message as any)?.additional_kwargs?.reasoning_content;
    return typeof reasoningContent === "string" && reasoningContent.length > 0
        ? reasoningContent
        : undefined;
}

function toDeepSeekToolSchema(tool: any) {
    return {
        type: "function",
        function: {
            name: tool.name,
            description: tool.description ?? "",
            parameters: z.toJSONSchema(tool.schema),
        },
    };
}

function toDeepSeekToolCalls(message: AIMessage) {
    const toolCalls = Array.isArray((message as any).tool_calls) ? (message as any).tool_calls : [];

    return toolCalls.map((toolCall: any) => ({
        id: toolCall.id,
        type: "function",
        function: {
            name: toolCall.name,
            arguments: JSON.stringify(toolCall.args ?? {}),
        },
    }));
}

function toDeepSeekMessages(messages: BaseMessage[]) {
    const keepReasoningContent = !isDeepSeekReasonerModel();

    return messages.flatMap<DeepSeekRequestMessage>((message) => {
        if (SystemMessage.isInstance(message)) {
            return [{
                role: "system",
                content: getMessageText(message),
            }];
        }

        if (HumanMessage.isInstance(message)) {
            return [{
                role: "user",
                content: getMessageText(message),
            }];
        }

        if (ToolMessage.isInstance(message)) {
            return [{
                role: "tool",
                tool_call_id: message.tool_call_id,
                content: getMessageText(message),
            }];
        }

        if (AIMessage.isInstance(message)) {
            const toolCalls = toDeepSeekToolCalls(message);
            const reasoningContent = getReasoningContent(message);

            return [{
                role: "assistant",
                content: getMessageText(message),
                ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
                ...(keepReasoningContent && reasoningContent ? { reasoning_content: reasoningContent } : {}),
            }];
        }

        return [];
    });
}

async function* readSseEvents(response: Response): AsyncGenerator<DeepSeekStreamChunk> {
    if (!response.body) {
        return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, "\n");

        while (buffer.includes("\n\n")) {
            const boundaryIndex = buffer.indexOf("\n\n");
            const rawEvent = buffer.slice(0, boundaryIndex);
            buffer = buffer.slice(boundaryIndex + 2);

            const data = rawEvent
                .split("\n")
                .filter((line) => line.startsWith("data:"))
                .map((line) => line.slice(5).trimStart())
                .join("\n")
                .trim();

            if (!data) {
                continue;
            }

            if (data === "[DONE]") {
                return;
            }

            yield JSON.parse(data) as DeepSeekStreamChunk;
        }
    }
}

function toToolCallChunks(toolCalls: DeepSeekToolDelta[] | undefined) {
    if (!Array.isArray(toolCalls)) {
        return [];
    }

    return toolCalls.map((toolCall) => ({
        name: toolCall.function?.name,
        args: toolCall.function?.arguments,
        id: toolCall.id,
        index: toolCall.index,
        type: "tool_call_chunk" as const,
    }));
}

function toUsageMetadata(chunk: DeepSeekStreamChunk) {
    if (!chunk.usage) {
        return undefined;
    }

    const reasoningTokens = chunk.usage.completion_tokens_details?.reasoning_tokens;

    return {
        input_tokens: chunk.usage.prompt_tokens ?? 0,
        output_tokens: chunk.usage.completion_tokens ?? 0,
        total_tokens: chunk.usage.total_tokens ?? 0,
        ...(reasoningTokens != null
            ? {
                output_token_details: {
                    reasoning: reasoningTokens,
                },
            }
            : {}),
    };
}

function toNormalizedChunk(chunk: DeepSeekStreamChunk, fallbackId: string) {
    const delta = chunk.choices?.[0]?.delta ?? {};
    const toolCallChunks = toToolCallChunks(delta.tool_calls);
    const usageMetadata = toUsageMetadata(chunk);

    return new AIMessageChunk({
        id: chunk.id ?? fallbackId,
        content: delta.content ?? "",
        ...(toolCallChunks.length > 0 ? { tool_call_chunks: toolCallChunks } : {}),
        ...(delta.reasoning_content
            ? {
                additional_kwargs: {
                    reasoning_content: delta.reasoning_content,
                },
            }
            : {}),
        response_metadata: {
            model_provider: "deepseek",
            ...(chunk.model ? { model_name: chunk.model } : {}),
        },
        ...(usageMetadata ? { usage_metadata: usageMetadata } : {}),
    } as any);
}

async function createStreamingResponse(messages: BaseMessage[]) {
    const baseUrl = getConfiguredBaseUrl();
    const modelName = getConfiguredModelName();

    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
            model: modelName,
            stream: true,
            messages: toDeepSeekMessages(messages),
            ...(!isDeepSeekReasonerModel(modelName)
                ? {
                    thinking: {
                        type: "enabled",
                    },
                    tools: registeredTools.map(toDeepSeekToolSchema),
                }
                : {}),
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`DeepSeek request failed with status ${response.status}: ${errorBody || "empty response body"}`);
    }

    return response;
}

export async function streamDeepSeekThinkingModel(
    messages: BaseMessage[],
    sendEvent: SendEvent,
    _runtimeOptions: ModelRuntimeOptions = {},
): Promise<AIMessage> {
    const response = await createStreamingResponse(messages);
    const fallbackId = uuid();
    let mergedChunk: AIMessageChunk | null = null;

    for await (const event of readSseEvents(response)) {
        const normalizedChunk = toNormalizedChunk(event, fallbackId);
        mergedChunk = mergedChunk ? mergedChunk.concat(normalizedChunk) : normalizedChunk;

        sendAiChunkEvent({
            chunk: normalizedChunk,
            mergedChunk,
            fallbackId,
            sendEvent,
        });
    }

    return finalizeAiMessage(mergedChunk, fallbackId);
}
