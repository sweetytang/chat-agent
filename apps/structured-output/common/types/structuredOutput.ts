export type StructuredOutputFormat = "guide" | "comparison" | "explanation";

export interface StructuredOutputHighlight {
    label: string;
    value: string;
}

export interface StructuredOutputCodeExample {
    language?: string;
    code: string;
    filename?: string;
}

export interface StructuredOutputSection {
    title: string;
    body: string;
    bullets?: string[];
    codeExample?: StructuredOutputCodeExample;
}

export interface StructuredOutputComparisonRow {
    label: string;
    values: string[];
}

export interface StructuredOutputComparisonTable {
    columns: string[];
    rows: StructuredOutputComparisonRow[];
}

export interface StructuredOutputPayload {
    title: string;
    summary: string;
    format: StructuredOutputFormat;
    highlights?: StructuredOutputHighlight[];
    sections: StructuredOutputSection[];
    comparisonTable?: StructuredOutputComparisonTable;
    nextSteps?: string[];
}
