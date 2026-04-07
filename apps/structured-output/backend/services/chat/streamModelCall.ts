import { AIMessage, AIMessageChunk, BaseMessage } from "@langchain/core/messages";
import { getModelWithTools } from "../ai/model.js";
import { isDeepSeekThinkingModeEnabled, type ModelRuntimeOptions } from "../ai/providerConfig.js";
import { streamDeepSeekThinkingModel } from "../ai/providers/deepseekThinking.js";
import { uuid } from "../../utils/uuid.js";
import { SendEvent } from "@backend/types";
import { finalizeAiMessage, sendAiChunkEvent } from "./aiMessageStream.js";

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

    for await (const chunk of stream) {
        mergedChunk = mergedChunk ? mergedChunk.concat(chunk) : chunk;
        sendAiChunkEvent({
            chunk,
            mergedChunk,
            fallbackId,
            sendEvent,
        });
    }

    return finalizeAiMessage(mergedChunk, fallbackId);
}
