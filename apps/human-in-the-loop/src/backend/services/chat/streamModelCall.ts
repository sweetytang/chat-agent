import { AIMessage, AIMessageChunk, BaseMessage } from "@langchain/core/messages";
import { getModelWithTools } from "../ai/model.js";
import { uuid } from "../../utils/uuid.js";
import { MessageTypeEnum, SendEvent } from "../../../types";

export async function streamModelCall(messages: BaseMessage[], sendEvent: SendEvent): Promise<AIMessage> {
    const stream = await getModelWithTools().stream(messages);

    const fallbackId = uuid();
    let mergedChunk: AIMessageChunk | null = null;

    for await (const chunk of stream) {
        mergedChunk = mergedChunk ? mergedChunk.concat(chunk) : chunk;
        sendEvent("messages", [{
            type: MessageTypeEnum.AI,
            id: mergedChunk.id || fallbackId,
            content: typeof chunk.content === "string" ? chunk.content : "",
            tool_calls: mergedChunk.tool_calls ?? [],
            tool_call_chunks: chunk.tool_call_chunks ?? [],
        }, {}]);
    }

    if (!mergedChunk) {
        return new AIMessage({
            id: fallbackId,
            content: "",
            tool_calls: [],
        });
    }

    return new AIMessage({
        id: mergedChunk.id || fallbackId,
        content: typeof mergedChunk.content === "string" ? mergedChunk.content : "",
        tool_calls: mergedChunk.tool_calls ?? [],
    });
}
