export type GenerativeUIComponentType =
    | "Hero"
    | "Stack"
    | "Panel"
    | "Metric"
    | "BulletList"
    | "DataTable"
    | "CodeBlock"
    | "Notice";

export type GenerativeUIStackDirection = "vertical" | "horizontal";
export type GenerativeUIStackGap = "sm" | "md" | "lg";
export type GenerativeUIPanelTone = "neutral" | "info" | "success" | "warning";
export type GenerativeUIEmphasis = "neutral" | "accent" | "success";

export interface GenerativeUIHeroProps {
    eyebrow?: string;
    title: string;
    body?: string;
    align?: "left" | "center";
}

export interface GenerativeUIStackProps {
    direction?: GenerativeUIStackDirection;
    gap?: GenerativeUIStackGap;
}

export interface GenerativeUIPanelProps {
    title?: string;
    description?: string;
    tone?: GenerativeUIPanelTone;
    padding?: "sm" | "md" | "lg";
}

export interface GenerativeUIMetricProps {
    label: string;
    value: string;
    detail?: string;
    emphasis?: GenerativeUIEmphasis;
}

export interface GenerativeUIBulletListProps {
    title?: string;
    items: string[];
}

export interface GenerativeUIDataTableProps {
    title?: string;
    columns: string[];
    rows: string[][];
}

export interface GenerativeUICodeBlockProps {
    language?: string;
    filename?: string;
    code: string;
}

export interface GenerativeUINoticeProps {
    title: string;
    body: string;
    tone?: Exclude<GenerativeUIPanelTone, "neutral">;
}

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

export type GenerativeUIElement<K extends GenerativeUIComponentType = GenerativeUIComponentType> = {
    type: K;
    props: GenerativeUIComponentPropsMap[K];
    children?: string[];
};

export interface GenerativeUISpec {
    root: string;
    elements: Partial<{
        [K in string]: GenerativeUIElement;
    }>;
    state?: Record<string, unknown>;
}
