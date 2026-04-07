import { AIMessage, BaseMessage } from "@langchain/core/messages";
import { STRUCTURED_OUTPUT_TOOL_NAME } from "@common/constants";
import type { StructuredOutputPayload } from "@common/types/structuredOutput";

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStructuredOutputArgs(args: unknown): Partial<StructuredOutputPayload> | null {
    if (isRecord(args)) {
        return args as Partial<StructuredOutputPayload>;
    }

    if (typeof args !== "string" || !args.trim()) {
        return null;
    }

    try {
        const parsed = JSON.parse(args);
        return isRecord(parsed) ? parsed as Partial<StructuredOutputPayload> : null;
    } catch {
        return null;
    }
}

export function isStructuredOutputToolCall(toolCall: any): boolean {
    const toolName = toolCall?.name ?? toolCall?.call?.name;
    return toolName === STRUCTURED_OUTPUT_TOOL_NAME;
}

export function extractStructuredOutputPayload(
    message: BaseMessage,
    messageToolCalls: any[] = [],
): Partial<StructuredOutputPayload> | null {
    if (!AIMessage.isInstance(message)) {
        return null;
    }

    const toolCallFromStream = messageToolCalls.find(isStructuredOutputToolCall);
    const toolCallFromMessage = (message as any).tool_calls?.find?.(isStructuredOutputToolCall);
    const toolArgs = toolCallFromStream?.call?.args ?? toolCallFromMessage?.args;

    return parseStructuredOutputArgs(toolArgs);
}

export function hasStructuredOutputContent(payload: Partial<StructuredOutputPayload> | null) {
    if (!payload) {
        return false;
    }

    return Boolean(
        payload.title
        || payload.summary
        || payload.sections?.length
        || payload.comparisonTable?.rows?.length,
    );
}
