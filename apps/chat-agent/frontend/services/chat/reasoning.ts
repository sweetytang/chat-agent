import { AIMessage } from "@langchain/core/messages";

export interface AiDisplayContent {
    reasoningText: string;
    text: string;
}

export function extractAiDisplayContent(message: AIMessage): AiDisplayContent {
    const reasoningFromBlocks = message.contentBlocks
        .filter((block): block is { type: "reasoning"; reasoning: string } => (
            block.type === "reasoning" && typeof block.reasoning === "string"
        ))
        .map((block) => block.reasoning.trim())
        .filter(Boolean)
        .join("\n\n");
    const reasoningFromAdditionalKwargs = (message as AIMessage & {
        additional_kwargs?: {
            reasoning_content?: unknown;
            __raw_response?: {
                choices?: Array<{
                    delta?: { reasoning_content?: unknown };
                    message?: { reasoning_content?: unknown };
                }>;
            };
        };
    }).additional_kwargs?.reasoning_content;
    const reasoningFromRawResponse = (message as AIMessage & {
        additional_kwargs?: {
            __raw_response?: {
                choices?: Array<{
                    delta?: { reasoning_content?: unknown };
                    message?: { reasoning_content?: unknown };
                }>;
            };
        };
    }).additional_kwargs?.__raw_response?.choices?.[0];
    const reasoningText = reasoningFromBlocks
        || (typeof reasoningFromAdditionalKwargs === "string"
            ? reasoningFromAdditionalKwargs.trim()
            : typeof reasoningFromRawResponse?.message?.reasoning_content === "string"
                ? reasoningFromRawResponse.message.reasoning_content.trim()
                : typeof reasoningFromRawResponse?.delta?.reasoning_content === "string"
                    ? reasoningFromRawResponse.delta.reasoning_content.trim()
                    : "");

    return {
        reasoningText,
        text: message.text,
    };
}
