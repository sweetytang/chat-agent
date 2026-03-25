/**
 * model.ts — LLM 模型配置
 * 集中管理大模型的初始化参数，方便后续切换或调整。
 */
import { ChatOpenAI } from "@langchain/openai";
import dotenv from "dotenv";
import path from "path";
import { registeredTools } from './tools';

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY in .env");
}

/** ChatOpenAI 实例，供 Agent 和其他服务使用 */
export const model = new ChatOpenAI({
    model: process.env.MODEL_NAME as string,
    apiKey: process.env.OPENAI_API_KEY,
    configuration: {
        baseURL: process.env.OPENAI_BASE_URL,
    },
    temperature: 0,
});

/** 绑定工具的模型实例：模型会生成 tool_calls 但不会自动执行 */
export const modelWithTools = model.bindTools(registeredTools);
