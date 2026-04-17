import {
    BaseMessage,
    HumanMessage,
    SystemMessage,
    AIMessage,
    ToolMessage,
} from "@langchain/core/messages";
import { MessageTypeEnum, SerializedMessage } from "@common/types";
import { normalizeMessageContent } from "@common/utils/messageContent";

export function deserializeMessages(messages: SerializedMessage[] = []): BaseMessage[] {
    return messages.map((message) => {
        const {
            type,
            content,
            id,
            name,
            tool_calls,
            invalid_tool_calls,
            tool_call_id,
            additional_kwargs,
            response_metadata,
            usage_metadata,
        } = message;
        const safeToolCalls = Array.isArray(tool_calls) ? tool_calls : [];
        const safeInvalidToolCalls = Array.isArray(invalid_tool_calls) ? invalid_tool_calls : [];
        const safeContent = normalizeMessageContent(content);
        const commonFields = {
            content: safeContent,
            id,
            ...(typeof name === "string" ? { name } : {}),
            ...(additional_kwargs ? { additional_kwargs } : {}),
            ...(response_metadata ? { response_metadata } : {}),
        };

        switch (type) {
            case MessageTypeEnum.SYSTEM:
                return new SystemMessage(commonFields as any);
            case MessageTypeEnum.AI:
                return new AIMessage({
                    ...commonFields,
                    ...(safeToolCalls.length > 0 ? { tool_calls: safeToolCalls as any } : {}),
                    ...(safeInvalidToolCalls.length > 0 ? { invalid_tool_calls: safeInvalidToolCalls as any } : {}),
                    ...(usage_metadata ? { usage_metadata: usage_metadata as any } : {}),
                } as any);
            case MessageTypeEnum.TOOL:
                return new ToolMessage({
                    ...commonFields,
                    tool_call_id: tool_call_id ?? id,
                } as any);
            case MessageTypeEnum.HUMAN:
            default:
                return new HumanMessage(commonFields as any);
        }
    });
}
