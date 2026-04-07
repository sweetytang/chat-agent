import {
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
} from "@langchain/core/messages";
import { MessageTypeEnum, SerializedMessage } from "@common/types";

function toMessageContent(content: unknown) {
    if (typeof content === "string" || Array.isArray(content)) {
        return content;
    }

    return "";
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
