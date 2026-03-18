/**
 * model.ts — LLM 模型配置
 * 集中管理大模型的初始化参数，方便后续切换或调整。
 */
import { ChatOpenAI } from "@langchain/openai";

// 设置默认环境变量（优先使用外部 .env 配置）
process.env.MODEL_NAME = process.env.MODEL_NAME || "deepseek-chat";
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "sk-2706991410104448896a631719251925";
process.env.OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.deepseek.com/v1";

/** ChatOpenAI 实例，供 Agent 和其他服务使用 */
export const model = new ChatOpenAI({
    model: process.env.MODEL_NAME,
    apiKey: process.env.OPENAI_API_KEY,
    configuration: {
        baseURL: process.env.OPENAI_BASE_URL,
    },
    temperature: 0,
});
