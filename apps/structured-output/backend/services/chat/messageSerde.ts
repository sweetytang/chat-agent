import {
    SystemMessage,
    AIMessage,
    BaseMessage,
    HumanMessage,
    ToolMessage,
} from "@langchain/core/messages";
import { normalizeMessageContent } from "@common/utils/messageContent";
import { uuid } from "../../utils/uuid.js";
import { MessageTypeEnum, SerializedMessage } from "@common/types";

export function serializeMessages(messages: BaseMessage[]): SerializedMessage[] {
    return messages.map((message: any) => {
        const serialized: SerializedMessage = {
            type: message?._getType?.() ?? message?.type ?? MessageTypeEnum.HUMAN,
            content: message?.content,
            id: message?.id ?? uuid(),
        };

        if (typeof message?.name === "string" && message.name.length > 0) {
            serialized.name = message.name;
        }

        if (Array.isArray(message?.tool_calls)) {
            serialized.tool_calls = message.tool_calls;
        }

        if (Array.isArray(message?.invalid_tool_calls)) {
            serialized.invalid_tool_calls = message.invalid_tool_calls;
        }

        if (typeof message?.tool_call_id === "string") {
            serialized.tool_call_id = message.tool_call_id;
        }

        if (message?.additional_kwargs && Object.keys(message.additional_kwargs).length > 0) {
            serialized.additional_kwargs = message.additional_kwargs;
        }

        if (message?.response_metadata && Object.keys(message.response_metadata).length > 0) {
            serialized.response_metadata = message.response_metadata;
        }

        if (message?.usage_metadata && Object.keys(message.usage_metadata).length > 0) {
            serialized.usage_metadata = message.usage_metadata;
        }

        return serialized;
    });
}

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
