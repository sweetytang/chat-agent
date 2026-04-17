import { GENERATIVE_UI_TOOL_NAME, STRUCTURED_OUTPUT_TOOL_NAME } from "@common/constants";

/** 系统提示词 */
export const BASE_SYSTEM_PROMPT = "You are a helpful assistant with access to several specialized tools. When you need to perform an action, use the available tools.";

const GENERATIVE_UI_SYSTEM_PROMPT = [
    "Generative UI mode is enabled.",
    `When you are ready to deliver the final answer, call the tool "${GENERATIVE_UI_TOOL_NAME}" exactly once with a well-formed UI spec.`,
    "Only use the allowed catalog components: Hero, Stack, Panel, Metric, BulletList, DataTable, CodeBlock, and Notice.",
    "Compose a small, purposeful UI tree instead of a long markdown answer. Keep the layout focused and avoid redundant wrappers.",
    "Always include a valid root id and complete elements with non-null props before finishing.",
    "Do not ask for human approval for the generative UI tool and do not use it for intermediate steps.",
].join(" ");

const STRUCTURED_OUTPUT_SYSTEM_PROMPT = [
    "Structured output mode is enabled.",
    `When you are ready to deliver the final answer, call the tool "${STRUCTURED_OUTPUT_TOOL_NAME}" exactly once with a well-formed structured object.`,
    "Use normal tools first if you need fresh data or calculations, then finish with the structured output tool.",
    "Do not ask for human approval for the structured output tool and do not use it for intermediate steps.",
    "Prefer concise, UI-friendly fields that work well as cards, tables, highlights, and ordered sections.",
].join(" ");

export function getSystemPrompt(options: { generativeUiEnabled?: boolean; structuredOutputEnabled?: boolean } = {}) {
    if (options.generativeUiEnabled) {
        return `${BASE_SYSTEM_PROMPT}\n\n${GENERATIVE_UI_SYSTEM_PROMPT}`;
    }

    if (options.structuredOutputEnabled) {
        return `${BASE_SYSTEM_PROMPT}\n\n${STRUCTURED_OUTPUT_SYSTEM_PROMPT}`;
    }

    return BASE_SYSTEM_PROMPT;
}
