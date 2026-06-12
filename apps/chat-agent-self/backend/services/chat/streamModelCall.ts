import { AIMessage, AIMessageChunk, BaseMessage } from "@langchain/core/messages";
import { getModelWithTools } from "../ai/model.js";
import { isDeepSeekThinkingModeEnabled, type ModelRuntimeOptions } from "../ai/providerConfig.js";
import { streamDeepSeekThinkingModel } from "../ai/providers/deepseekThinking.js";
import { uuid } from "../../utils/uuid.js";
import { SendEvent } from "@backend/types";
import { finalizeAiMessage, sendAiChunkEvent } from "./aiMessageStream.js";

/**
 * 当思考模式未开启时，从 chunk 的 additional_kwargs 中剥离 reasoning_content。
 * DeepSeek 某些模型（如 deepseek-v4-flash）即使不传 thinking 参数也会在响应中携带
 * reasoning_content，此函数确保在非思考模式下该字段不会被透传给前端。
 */
function stripThinkingFromChunk(chunk: AIMessageChunk): AIMessageChunk {
    const kwargs = chunk.additional_kwargs;
    if (!kwargs || !("reasoning_content" in kwargs)) {
        return chunk;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { reasoning_content: _removed, ...rest } = kwargs;
    // AIMessageChunk 的属性是只读的，需要创建一个浅拷贝覆盖 additional_kwargs
    return Object.assign(Object.create(Object.getPrototypeOf(chunk)), chunk, {
        additional_kwargs: rest,
    });
}

export async function streamModelCall(
    messages: BaseMessage[],
    sendEvent: SendEvent,
    runtimeOptions: ModelRuntimeOptions = {},
): Promise<AIMessage> {
    if (isDeepSeekThinkingModeEnabled(runtimeOptions)) {
        return streamDeepSeekThinkingModel(messages, sendEvent, runtimeOptions);
    }

    const stream = await getModelWithTools(runtimeOptions).stream(messages);

    const fallbackId = uuid();
    let mergedChunk: AIMessageChunk | null = null;

    for await (const rawChunk of stream) {
        // 思考模式未开启时，剥离模型可能附带的 reasoning_content，避免意外展示
        const chunk = stripThinkingFromChunk(rawChunk);
        mergedChunk = mergedChunk ? mergedChunk.concat(chunk) : chunk;
        sendAiChunkEvent({
            chunk,
            mergedChunk,
            fallbackId,
            sendEvent,
        });
    }

    return finalizeAiMessage(mergedChunk, fallbackId, false);
}

