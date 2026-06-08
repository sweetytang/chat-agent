import { AIMessage, AIMessageChunk } from "@langchain/core/messages";
import { MessageTypeEnum } from "@common/types";
import { normalizeMessageContent } from "@common/utils/messageContent";
import type { SendEvent } from "@backend/types";

type SendAiChunkEventOptions = {
    chunk: AIMessageChunk;
    mergedChunk: AIMessageChunk;
    fallbackId: string;
    sendEvent: SendEvent;
};

export function sendAiChunkEvent({
    chunk,
    mergedChunk,
    fallbackId,
    sendEvent,
}: SendAiChunkEventOptions) {
    sendEvent("messages", [{
        type: MessageTypeEnum.AI,
        id: mergedChunk.id || fallbackId,
        content: normalizeMessageContent(chunk.content),
        tool_calls: mergedChunk.tool_calls ?? [],
        tool_call_chunks: chunk.tool_call_chunks ?? [],
        additional_kwargs: chunk.additional_kwargs ?? {},
        response_metadata: mergedChunk.response_metadata ?? chunk.response_metadata ?? {},
        usage_metadata: chunk.usage_metadata ?? {},
    }, {}]);
}

export function finalizeAiMessage(mergedChunk: AIMessageChunk | null, fallbackId: string): AIMessage {
    if (!mergedChunk) {
        return new AIMessage({
            id: fallbackId,
            content: "",
            tool_calls: [],
        });
    }

    return new AIMessage({
        id: mergedChunk.id || fallbackId,
        content: normalizeMessageContent(mergedChunk.content),
        ...(mergedChunk.tool_calls?.length ? { tool_calls: mergedChunk.tool_calls } : {}),
        ...(mergedChunk.invalid_tool_calls?.length ? { invalid_tool_calls: mergedChunk.invalid_tool_calls } : {}),
        ...(mergedChunk.additional_kwargs ? { additional_kwargs: mergedChunk.additional_kwargs } : {}),
        ...(mergedChunk.response_metadata ? { response_metadata: mergedChunk.response_metadata } : {}),
        ...(mergedChunk.usage_metadata ? { usage_metadata: mergedChunk.usage_metadata } : {}),
    } as any);
}
