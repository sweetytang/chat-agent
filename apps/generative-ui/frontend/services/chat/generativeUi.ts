import { AIMessage, BaseMessage } from "@langchain/core/messages";
import type { Spec } from "@json-render/core";
import { GENERATIVE_UI_TOOL_NAME } from "@common/constants";
import type { GenerativeUIElement, GenerativeUISpec } from "@common/types/generativeUi";

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isStringMatrix(value: unknown): value is string[][] {
    return Array.isArray(value) && value.every((item) => isStringArray(item));
}

function parseGenerativeUiArgs(args: unknown): Partial<GenerativeUISpec> | null {
    if (isRecord(args)) {
        return args as Partial<GenerativeUISpec>;
    }

    if (typeof args !== "string" || !args.trim()) {
        return null;
    }

    try {
        const parsed = JSON.parse(args);
        return isRecord(parsed) ? parsed as Partial<GenerativeUISpec> : null;
    } catch {
        return null;
    }
}

function isRenderableGenerativeUiElement(value: unknown): value is GenerativeUIElement {
    if (!isRecord(value) || typeof value.type !== "string" || !isRecord(value.props)) {
        return false;
    }

    switch (value.type) {
        case "Hero":
            return typeof value.props.title === "string" && value.props.title.trim().length > 0;
        case "Stack":
        case "Panel":
            return true;
        case "Metric":
            return typeof value.props.label === "string"
                && typeof value.props.value === "string";
        case "BulletList":
            return isStringArray(value.props.items) && value.props.items.length > 0;
        case "DataTable":
            return isStringArray(value.props.columns)
                && value.props.columns.length > 0
                && isStringMatrix(value.props.rows)
                && value.props.rows.length > 0;
        case "CodeBlock":
            return typeof value.props.code === "string";
        case "Notice":
            return typeof value.props.title === "string"
                && typeof value.props.body === "string";
        default:
            return false;
    }
}

export function isGenerativeUiToolCall(toolCall: any): boolean {
    const toolName = toolCall?.name ?? toolCall?.call?.name;
    return toolName === GENERATIVE_UI_TOOL_NAME;
}

export function extractGenerativeUiPayload(
    message: BaseMessage,
    messageToolCalls: any[] = [],
): Partial<GenerativeUISpec> | null {
    if (!AIMessage.isInstance(message)) {
        return null;
    }

    const toolCallFromStream = messageToolCalls.find(isGenerativeUiToolCall);
    const toolCallFromMessage = (message as any).tool_calls?.find?.(isGenerativeUiToolCall);
    const toolArgs = toolCallFromStream?.call?.args ?? toolCallFromMessage?.args;

    return parseGenerativeUiArgs(toolArgs);
}

export function toRenderableGenerativeUiSpec(payload: Partial<GenerativeUISpec> | null): Spec | null {
    if (!payload || typeof payload.root !== "string" || !payload.root.trim() || !isRecord(payload.elements)) {
        return null;
    }

    const safeElements = Object.entries(payload.elements).reduce<Record<string, Spec["elements"][string]>>((result, [key, element]) => {
        if (!isRenderableGenerativeUiElement(element)) {
            return result;
        }

        result[key] = {
            type: element.type,
            props: element.props as Record<string, unknown>,
            children: isStringArray(element.children) ? element.children : [],
        };

        return result;
    }, {});

    const rootElement = safeElements[payload.root];
    if (!rootElement?.type || rootElement.props == null) {
        return null;
    }

    if (isRecord(payload.state)) {
        return {
            root: payload.root,
            elements: safeElements,
            state: payload.state,
        };
    }

    return {
        root: payload.root,
        elements: safeElements,
    };
}

export function hasGenerativeUiContent(payload: Partial<GenerativeUISpec> | null) {
    return Boolean(toRenderableGenerativeUiSpec(payload));
}
