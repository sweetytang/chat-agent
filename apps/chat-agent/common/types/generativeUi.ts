import { z } from "zod";

export const stackDirectionSchema = z.enum(["vertical", "horizontal"]);
export const stackGapSchema = z.enum(["sm", "md", "lg"]);
export const panelToneSchema = z.enum(["neutral", "info", "success", "warning"]);
export const noticeToneSchema = z.enum(["info", "success", "warning"]);
export const emphasisSchema = z.enum(["neutral", "accent", "success"]);
export const heroAlignSchema = z.enum(["left", "center"]);
export const panelPaddingSchema = z.enum(["sm", "md", "lg"]);

export const stackPropsSchema = z.object({
    direction: stackDirectionSchema.optional().describe("Layout direction for child components"),
    gap: stackGapSchema.optional().describe("Spacing between child components"),
});

export const heroPropsSchema = z.object({
    eyebrow: z.string().optional().describe("Short label displayed above the main title"),
    title: z.string().describe("Primary headline for the screen"),
    body: z.string().optional().describe("Supporting explanation. Markdown is allowed."),
    align: heroAlignSchema.optional().describe("Text alignment for the hero block"),
});

export const panelPropsSchema = z.object({
    title: z.string().optional().describe("Optional section title"),
    description: z.string().optional().describe("Optional helper text shown below the title"),
    tone: panelToneSchema.optional().describe("Visual emphasis for the panel"),
    padding: panelPaddingSchema.optional().describe("Inner spacing size"),
});

export const metricPropsSchema = z.object({
    label: z.string().describe("Short metric label"),
    value: z.string().describe("Main metric value"),
    detail: z.string().optional().describe("Supplementary context for the metric"),
    emphasis: emphasisSchema.optional().describe("Visual emphasis for the metric"),
});

export const bulletListPropsSchema = z.object({
    title: z.string().optional().describe("Optional title for the list"),
    items: z.array(z.string()).min(1).max(8).describe("Ordered or unordered takeaways"),
});

export const dataTablePropsSchema = z.object({
    title: z.string().optional().describe("Optional title shown above the table"),
    columns: z.array(z.string()).min(1).max(5).describe("Table headers"),
    rows: z.array(z.array(z.string()).min(1).max(5)).min(1).max(8).describe("Table body rows. Every row should match the column count."),
});

export const codeBlockPropsSchema = z.object({
    language: z.string().optional().describe("Programming language name, such as ts or python"),
    filename: z.string().optional().describe("Optional filename label"),
    code: z.string().describe("Runnable or copy-ready code example"),
});

export const noticePropsSchema = z.object({
    title: z.string().describe("Short notice title"),
    body: z.string().describe("Notice content. Markdown is allowed."),
    tone: noticeToneSchema.optional().describe("Notice appearance"),
});

export const generativeUiElementSchema = z.discriminatedUnion("type", [
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

export const generativeUiSchema = z.object({
    root: z.string().describe("The element id of the root component"),
    elements: z.record(z.string(), generativeUiElementSchema).describe("A flat map of UI elements keyed by element id"),
    state: z.record(z.string(), z.unknown()).optional().describe("Optional initial UI state"),
});

export type GenerativeUIStackDirection = z.infer<typeof stackDirectionSchema>;
export type GenerativeUIStackGap = z.infer<typeof stackGapSchema>;
export type GenerativeUIPanelTone = z.infer<typeof panelToneSchema>;
export type GenerativeUIEmphasis = z.infer<typeof emphasisSchema>;

export type GenerativeUIHeroProps = z.infer<typeof heroPropsSchema>;
export type GenerativeUIStackProps = z.infer<typeof stackPropsSchema>;
export type GenerativeUIPanelProps = z.infer<typeof panelPropsSchema>;
export type GenerativeUIMetricProps = z.infer<typeof metricPropsSchema>;
export type GenerativeUIBulletListProps = z.infer<typeof bulletListPropsSchema>;
export type GenerativeUIDataTableProps = z.infer<typeof dataTablePropsSchema>;
export type GenerativeUICodeBlockProps = z.infer<typeof codeBlockPropsSchema>;
export type GenerativeUINoticeProps = z.infer<typeof noticePropsSchema>;

export type GenerativeUIComponentPropsMap = {
    Hero: GenerativeUIHeroProps;
    Stack: GenerativeUIStackProps;
    Panel: GenerativeUIPanelProps;
    Metric: GenerativeUIMetricProps;
    BulletList: GenerativeUIBulletListProps;
    DataTable: GenerativeUIDataTableProps;
    CodeBlock: GenerativeUICodeBlockProps;
    Notice: GenerativeUINoticeProps;
};

type GenerativeUIElementUnion = z.infer<typeof generativeUiElementSchema>;

export type GenerativeUIComponentType = GenerativeUIElementUnion["type"];
export type GenerativeUIElement<K extends GenerativeUIComponentType = GenerativeUIComponentType> = Extract<
    GenerativeUIElementUnion,
    { type: K }
>;
export type GenerativeUISpec = z.infer<typeof generativeUiSchema>;
