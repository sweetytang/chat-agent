import { createAgent } from "langchain";
import { ChatOpenAI } from "@langchain/openai";

const model = new ChatOpenAI({
    model: process.env.MODEL_NAME as string,
    apiKey: process.env.OPENAI_API_KEY as string,
    configuration: {
        baseURL: process.env.OPENAI_BASE_URL as string,
    },
    temperature: 0,
});

export const simpleAgent = createAgent({
    model,
    tools: [],
    systemPrompt: "You are a helpful assistant. Format your responses using markdown when appropriate — use headers, bold text, code blocks, tables, and lists to make answers clear and structured.",
});
