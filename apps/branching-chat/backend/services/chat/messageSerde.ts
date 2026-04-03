import {
    HumanMessage,
    AIMessage,
    SystemMessage,
    BaseMessage,
    ToolMessage,
} from "@langchain/core/messages";
import { uuid } from "../../utils/uuid.js";
import { MessageTypeEnum, SerializedMessage } from "@common/types";

function toMessageContent(content: unknown) {
    if (typeof content === "string" || Array.isArray(content)) {
        return content;
    }

    return "";
}

export function serializeMessages(messages: BaseMessage[]): SerializedMessage[] {
    return messages.map((message: any) => {
        const serialized: SerializedMessage = {
            type: message?._getType?.() ?? message?.type ?? MessageTypeEnum.HUMAN,
            content: message?.content,
            id: message?.id ?? uuid(),
        };

        if (Array.isArray(message?.tool_calls)) {
            serialized.tool_calls = message.tool_calls;
        }

        if (typeof message?.tool_call_id === "string") {
            serialized.tool_call_id = message.tool_call_id;
        }

        return serialized;
    });
}

export function deserializeMessages(messages: SerializedMessage[] = []): BaseMessage[] {
    return messages.map((message) => {
        const { type, content, id, tool_calls, tool_call_id } = message;
        const safeToolCalls = Array.isArray(tool_calls) ? tool_calls : [];
        const safeContent = toMessageContent(content);

        switch (type) {
            case MessageTypeEnum.SYSTEM:
                return new SystemMessage({ content: safeContent, id });
            case MessageTypeEnum.AI:
                return new AIMessage({ content: safeContent, id, tool_calls: safeToolCalls as any });
            case MessageTypeEnum.TOOL:
                return new ToolMessage({ content: safeContent, id, tool_call_id: tool_call_id ?? id });
            case MessageTypeEnum.HUMAN:
            default:
                return new HumanMessage({ content: safeContent, id });
        }
    });
}
