import { tool } from "@langchain/core/tools";
import { STRUCTURED_OUTPUT_TOOL_NAME } from "@common/constants";
import { structuredOutputSchema, type StructuredOutputPayload } from "@common/types/structuredOutput";

export const structuredResponseTool = tool(
    async (_input: StructuredOutputPayload) => "Structured output captured for rendering.",
    {
        name: STRUCTURED_OUTPUT_TOOL_NAME,
        description: "Return the final answer as structured data for the frontend UI. Use this only for the final response when structured output mode is enabled. Do not use it for intermediate reasoning or tool execution.",
        schema: structuredOutputSchema,
    },
);
