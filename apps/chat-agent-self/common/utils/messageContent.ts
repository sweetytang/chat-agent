import type { BaseMessage } from "@langchain/core/messages";

export function normalizeMessageContent(content: unknown) {
    if (typeof content === "string" || Array.isArray(content)) {
        return content;
    }

    return "";
}

export function getMessageText(message: BaseMessage): string {
    const text = (message as BaseMessage & { text?: unknown }).text;
    if (typeof text === "string") {
        return text;
    }

    if (typeof message.content === "string") {
        return message.content;
    }

    return "";
}
