import { ToolMessage } from "@langchain/core/messages";
import { createToolMessage } from "@backend/utils/createToolMessage.js";
import { MessageTypeEnum } from "@common/types";
import type { SendEvent } from '@backend/types';
import type { ModelRuntimeOptions } from "../providerConfig.js";
import { calculator } from "./calculatorTool.js";
import { structuredResponseTool, isStructuredOutputToolCall } from "./structuredResponseTool.js";
import { getWeather } from "./weatherTool.js";
import { webSearch } from "./webSearchTool.js";

export const executableTools = [getWeather, calculator, webSearch];

export const allAvailableTools = [...executableTools, structuredResponseTool];

export function getRuntimeTools(runtimeOptions: ModelRuntimeOptions = {}) {
    if (runtimeOptions.structuredOutputEnabled) {
        return allAvailableTools;
    }

    return executableTools;
}

export function getExecutableToolCalls(toolCalls: any[]): any[] {
    return toolCalls.filter((toolCall) => !isStructuredOutputToolCall(toolCall));
}

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
        if (isStructuredOutputToolCall(toolCall)) {
            continue;
        }

        const tool = executableTools.find((candidate: any) => candidate.name === toolCall.name);

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
