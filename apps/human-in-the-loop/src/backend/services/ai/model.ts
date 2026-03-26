import { ChatOpenAI } from "@langchain/openai";
import { registeredTools } from "./tools/index.js";

let modelInstance: ChatOpenAI | null = null;
let modelWithToolsInstance: ReturnType<ChatOpenAI["bindTools"]> | null = null;

function requireModelConfig() {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("Missing OPENAI_API_KEY in .env");
    }
}

export function getModel() {
    requireModelConfig();

    if (!modelInstance) {
        modelInstance = new ChatOpenAI({
            model: process.env.MODEL_NAME as string,
            apiKey: process.env.OPENAI_API_KEY,
            configuration: {
                baseURL: process.env.OPENAI_BASE_URL,
            },
            temperature: 0,
        });
    }

    return modelInstance;
}

export function getModelWithTools() {
    if (!modelWithToolsInstance) {
        modelWithToolsInstance = getModel().bindTools(registeredTools);
    }

    return modelWithToolsInstance;
}
