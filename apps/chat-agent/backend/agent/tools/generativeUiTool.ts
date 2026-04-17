import { tool } from "@langchain/core/tools";
import { GENERATIVE_UI_TOOL_NAME } from "@common/constants";
import { generativeUiSchema, type GenerativeUISpec } from "@common/types/generativeUi";

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
