import { createAgent } from "langchain";
import { getModel } from "./model.js";
import { registeredTools } from "./tools/index.js";

export const simpleAgent = createAgent({
    model: getModel(),
    tools: registeredTools,
    systemPrompt: "You are a helpful assistant with access to several specialized tools.",
});
