import { ToolMessage } from "@langchain/core/messages";
import { createToolMessage } from "@backend/utils/createToolMessage";
import { generativeUiTool } from "./generativeUiTool";
import { structuredResponseTool } from "./structuredResponseTool";
import { queryWeather } from "./weather";
import { webSearch } from "./search";
import { GENERATIVE_UI_TOOL_NAME, STRUCTURED_OUTPUT_TOOL_NAME } from "@common/constants";
import type { RunMetadata } from "@common/types/run";

export const executableTools = [queryWeather, webSearch];
export const presentationTools = [generativeUiTool, structuredResponseTool];
export const allRuntimeTools = [...executableTools, ...presentationTools];

export function getRuntimeTools(runtimeOptions: RunMetadata = {}) {
    if (runtimeOptions.generativeUiEnabled) {
        return [...executableTools, generativeUiTool];
    }

    if (runtimeOptions.structuredOutputEnabled) {
        return [...executableTools, structuredResponseTool];
    }

    return executableTools;
}

export function isPresentationToolCall(toolCall: any): boolean {
    const toolName = toolCall?.name ?? toolCall?.call?.name;
    return [GENERATIVE_UI_TOOL_NAME, STRUCTURED_OUTPUT_TOOL_NAME].includes(toolName);
}


export function getExecutableToolCalls(toolCalls: any[]): any[] {
    return toolCalls.filter((toolCall) => !isPresentationToolCall(toolCall));
}


export function createPresentationToolMessage(toolCall: any): ToolMessage | null {
    if (typeof toolCall?.id !== "string") {
        return null;
    }

    const toolName = toolCall?.name ?? toolCall?.call?.name;
    switch (toolName) {
        case GENERATIVE_UI_TOOL_NAME:
            return createToolMessage("Generative UI spec captured for rendering.", toolCall.id);
        case STRUCTURED_OUTPUT_TOOL_NAME:
            return createToolMessage("Structured output captured for rendering.", toolCall.id);
        default:
            return null;
    }
}
