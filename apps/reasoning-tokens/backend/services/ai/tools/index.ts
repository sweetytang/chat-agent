import { ToolMessage } from "@langchain/core/messages";
import { createToolMessage } from "@backend/utils/createToolMessage.js";
import { calculator } from "./calculatorTool.js";
import { getWeather } from "./weatherTool.js";
import { webSearch } from "./webSearchTool.js";
import { MessageTypeEnum } from "@common/types";
import type { SendEvent } from '@backend/types';

export const registeredTools = [getWeather, calculator, webSearch];

function sendToolMessage(sendEvent: SendEvent, message: ToolMessage) {
    sendEvent("messages", [{
        type: MessageTypeEnum.TOOL,
        id: message.id,
        content: message.content,
        tool_call_id: message.tool_call_id,
    }, {}]);
}

export async function executeTools(toolCalls: any[], sendEvent: SendEvent): Promise<ToolMessage[]> {
    const results: ToolMessage[] = [];

    for (const toolCall of toolCalls) {
        const tool = registeredTools.find((candidate: any) => candidate.name === toolCall.name);

        if (!tool) {
            const errorMessage = createToolMessage(`Tool "${toolCall.name}" not found`, toolCall.id);
            results.push(errorMessage);
            sendToolMessage(sendEvent, errorMessage);
            continue;
        }

        try {
            const result = await (tool as any).invoke(toolCall.args);
            const toolMessage = createToolMessage(
                typeof result === "string" ? result : JSON.stringify(result),
                toolCall.id,
            );
            results.push(toolMessage);
            sendToolMessage(sendEvent, toolMessage);
        } catch (error: any) {
            const errorMessage = createToolMessage(`Error: ${error.message}`, toolCall.id);
            results.push(errorMessage);
            sendToolMessage(sendEvent, errorMessage);
        }
    }

    return results;
}
