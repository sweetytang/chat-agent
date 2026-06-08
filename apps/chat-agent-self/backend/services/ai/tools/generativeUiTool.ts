import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { GENERATIVE_UI_TOOL_NAME } from "@common/constants";
import type { GenerativeUISpec } from "@common/types/generativeUi";

const stackPropsSchema = z.object({
    direction: z.enum(["vertical", "horizontal"]).optional().describe("Layout direction for child components"),
    gap: z.enum(["sm", "md", "lg"]).optional().describe("Spacing between child components"),
});

const heroPropsSchema = z.object({
    eyebrow: z.string().optional().describe("Short label displayed above the main title"),
    title: z.string().describe("Primary headline for the screen"),
    body: z.string().optional().describe("Supporting explanation. Markdown is allowed."),
    align: z.enum(["left", "center"]).optional().describe("Text alignment for the hero block"),
});

const panelPropsSchema = z.object({
    title: z.string().optional().describe("Optional section title"),
    description: z.string().optional().describe("Optional helper text shown below the title"),
    tone: z.enum(["neutral", "info", "success", "warning"]).optional().describe("Visual emphasis for the panel"),
    padding: z.enum(["sm", "md", "lg"]).optional().describe("Inner spacing size"),
});

const metricPropsSchema = z.object({
    label: z.string().describe("Short metric label"),
    value: z.string().describe("Main metric value"),
    detail: z.string().optional().describe("Supplementary context for the metric"),
    emphasis: z.enum(["neutral", "accent", "success"]).optional().describe("Visual emphasis for the metric"),
});

const bulletListPropsSchema = z.object({
    title: z.string().optional().describe("Optional title for the list"),
    items: z.array(z.string()).min(1).max(8).describe("Ordered or unordered takeaways"),
});

const dataTablePropsSchema = z.object({
    title: z.string().optional().describe("Optional title shown above the table"),
    columns: z.array(z.string()).min(1).max(5).describe("Table headers"),
    rows: z.array(z.array(z.string()).min(1).max(5)).min(1).max(8).describe("Table body rows. Every row should match the column count."),
});

const codeBlockPropsSchema = z.object({
    language: z.string().optional().describe("Programming language name, such as ts or python"),
    filename: z.string().optional().describe("Optional filename label"),
    code: z.string().describe("Runnable or copy-ready code example"),
});

const noticePropsSchema = z.object({
    title: z.string().describe("Short notice title"),
    body: z.string().describe("Notice content. Markdown is allowed."),
    tone: z.enum(["info", "success", "warning"]).optional().describe("Notice appearance"),
});

const generativeUiElementSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("Hero"),
        props: heroPropsSchema,
        children: z.array(z.string()).optional(),
    }),
    z.object({
        type: z.literal("Stack"),
        props: stackPropsSchema,
        children: z.array(z.string()).optional(),
    }),
    z.object({
        type: z.literal("Panel"),
        props: panelPropsSchema,
        children: z.array(z.string()).optional(),
    }),
    z.object({
        type: z.literal("Metric"),
        props: metricPropsSchema,
        children: z.array(z.string()).optional(),
    }),
    z.object({
        type: z.literal("BulletList"),
        props: bulletListPropsSchema,
        children: z.array(z.string()).optional(),
    }),
    z.object({
        type: z.literal("DataTable"),
        props: dataTablePropsSchema,
        children: z.array(z.string()).optional(),
    }),
    z.object({
        type: z.literal("CodeBlock"),
        props: codeBlockPropsSchema,
        children: z.array(z.string()).optional(),
    }),
    z.object({
        type: z.literal("Notice"),
        props: noticePropsSchema,
        children: z.array(z.string()).optional(),
    }),
]);

const generativeUiSchema = z.object({
    root: z.string().describe("The element id of the root component"),
    elements: z.record(z.string(), generativeUiElementSchema).describe("A flat map of UI elements keyed by element id"),
    state: z.record(z.string(), z.unknown()).optional().describe("Optional initial UI state"),
});

const GENERATIVE_UI_CATALOG_DESCRIPTION = [
    "Allowed components:",
    "Hero(title, eyebrow?, body?, align?) for the top summary area.",
    "Stack(direction?, gap?) for vertical or horizontal layout grouping.",
    "Panel(title?, description?, tone?, padding?) as a card container.",
    "Metric(label, value, detail?, emphasis?) for compact KPI cards.",
    "BulletList(title?, items[]) for checklists or takeaways.",
    "DataTable(title?, columns[], rows[][]) for comparisons and tabular facts.",
    "CodeBlock(code, language?, filename?) for examples.",
    "Notice(title, body, tone?) for warnings, tips, or highlights.",
].join(" ");

export const generativeUiTool = tool(
    async (_input: GenerativeUISpec) => "Generative UI spec captured for rendering.",
    {
        name: GENERATIVE_UI_TOOL_NAME,
        description: `Return the final answer as a json-render UI spec for the frontend. ${GENERATIVE_UI_CATALOG_DESCRIPTION} Use this only for the final response when generative UI mode is enabled.`,
        schema: generativeUiSchema,
    },
);

export function isGenerativeUiToolCall(toolCall: any): boolean {
    const toolName = toolCall?.name ?? toolCall?.call?.name;
    return toolName === GENERATIVE_UI_TOOL_NAME;
}
