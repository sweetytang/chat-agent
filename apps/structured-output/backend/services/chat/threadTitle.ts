import { MessageTypeEnum } from "@common/types";

export function extractThreadTitle(messages: any[]): string {
    const firstHumanMessage = messages.find((message: any) => message.type === MessageTypeEnum.HUMAN);
    const content = firstHumanMessage?.content;

    if (typeof content === "string") {
        return content.trim() || "新对话";
    }

    if (!Array.isArray(content)) {
        return "新对话";
    }

    const text = content
        .map((item) => {
            if (typeof item === "string") {
                return item;
            }
            if (
                item &&
                typeof item === "object" &&
                Object.prototype.hasOwnProperty.call(item, "text") &&
                typeof item.text === "string"
            ) {
                return item.text;
            }
            return "";
        })
        .join(" ")
        .trim();

    return text || "新对话";
}
