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

export function finalizeAiMessage(mergedChunk: AIMessageChunk | null, fallbackId: string, includeReasoning = true): AIMessage {
    if (!mergedChunk) {
        return new AIMessage({
            id: fallbackId,
            content: "",
            tool_calls: [],
        });
    }

    // 当思考模式关闭时，从最终消息中也剥离 reasoning_content，
    // 防止存入数据库后，历史记录加载时意外显示
    const additionalKwargs = (() => {
        if (!mergedChunk.additional_kwargs) return undefined;
        if (includeReasoning) return mergedChunk.additional_kwargs;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { reasoning_content: _removed, ...rest } = mergedChunk.additional_kwargs;
        return rest;
    })();

    return new AIMessage({
        id: mergedChunk.id || fallbackId,
        content: normalizeMessageContent(mergedChunk.content),
        ...(mergedChunk.tool_calls?.length ? { tool_calls: mergedChunk.tool_calls } : {}),
        ...(mergedChunk.invalid_tool_calls?.length ? { invalid_tool_calls: mergedChunk.invalid_tool_calls } : {}),
        ...(additionalKwargs ? { additional_kwargs: additionalKwargs } : {}),
        ...(mergedChunk.response_metadata ? { response_metadata: mergedChunk.response_metadata } : {}),
        ...(mergedChunk.usage_metadata ? { usage_metadata: mergedChunk.usage_metadata } : {}),
    } as any);
}

