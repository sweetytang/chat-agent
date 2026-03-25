import { ToolMessage } from "@langchain/core/messages";
import { uuid } from "./uuid";

export function createToolMessage(content: string, toolCallId: string): ToolMessage {
    return new ToolMessage({
        content,
        tool_call_id: toolCallId,
        id: uuid(),
    });
}