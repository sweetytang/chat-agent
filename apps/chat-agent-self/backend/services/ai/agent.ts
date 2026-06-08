import { createAgent } from "langchain";
import { BASE_SYSTEM_PROMPT } from "@backend/constants";
import { getModel } from "./model.js";
import { executableTools } from "./tools/index.js";

export const simpleAgent = createAgent({
    model: getModel(),
    tools: executableTools,
    systemPrompt: BASE_SYSTEM_PROMPT,
});
