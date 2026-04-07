import { createAgent } from "langchain";
import { BASE_SYSTEM_PROMPT } from "@backend/constants";
import { getModel } from "./model.js";
import { allAvailableTools } from "./tools/index.js";

export const simpleAgent = createAgent({
    model: getModel(),
    tools: allAvailableTools,
    systemPrompt: BASE_SYSTEM_PROMPT,
});
