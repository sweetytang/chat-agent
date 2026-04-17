import { z } from "zod";

export const structuredOutputFormatSchema = z.enum(["guide", "comparison", "explanation"]);

export const structuredOutputHighlightSchema = z.object({
    label: z.string().describe("A short label for a key metric or takeaway"),
    value: z.string().describe("The value paired with the label"),
});

export const structuredOutputCodeExampleSchema = z.object({
    language: z.string().optional().describe("Programming language name, for example ts or python"),
    code: z.string().describe("Executable or copy-ready code example"),
    filename: z.string().optional().describe("Optional filename for the code example"),
});

export const structuredOutputSectionSchema = z.object({
    title: z.string().describe("Section title shown in the card"),
    body: z.string().describe("Main explanation for this section. Markdown is allowed."),
    bullets: z.array(z.string()).max(6).optional().describe("Optional bullet list for compact takeaways"),
    codeExample: structuredOutputCodeExampleSchema.optional().describe("Optional code snippet for this section"),
});

export const structuredOutputComparisonRowSchema = z.object({
    label: z.string().describe("Name of the comparison row"),
    values: z.array(z.string()).min(1).max(3).describe("Values for the remaining columns"),
});

export const structuredOutputComparisonTableSchema = z.object({
    columns: z.array(z.string()).min(2).max(4).describe("Table columns. The first column should usually be the comparison dimension."),
    rows: z.array(structuredOutputComparisonRowSchema).max(8).describe("Table row data"),
});

export const structuredOutputSchema = z.object({
    title: z.string().describe("Short, user-facing title for the answer"),
    summary: z.string().describe("A brief overview that explains the answer in one paragraph"),
    format: structuredOutputFormatSchema.describe("The best presentation format for the answer"),
    highlights: z.array(structuredOutputHighlightSchema).max(6).optional().describe("Optional highlight metrics or quick facts"),
    sections: z.array(structuredOutputSectionSchema).min(1).max(6).describe("Main content sections in display order"),
    comparisonTable: structuredOutputComparisonTableSchema.optional().describe("Optional table for side-by-side comparisons"),
    nextSteps: z.array(z.string()).max(6).optional().describe("Optional next actions the user can take after reading the answer"),
});

export type StructuredOutputFormat = z.infer<typeof structuredOutputFormatSchema>;
export type StructuredOutputHighlight = z.infer<typeof structuredOutputHighlightSchema>;
export type StructuredOutputCodeExample = z.infer<typeof structuredOutputCodeExampleSchema>;
export type StructuredOutputSection = z.infer<typeof structuredOutputSectionSchema>;
export type StructuredOutputComparisonRow = z.infer<typeof structuredOutputComparisonRowSchema>;
export type StructuredOutputComparisonTable = z.infer<typeof structuredOutputComparisonTableSchema>;
export type StructuredOutputPayload = z.infer<typeof structuredOutputSchema>;
