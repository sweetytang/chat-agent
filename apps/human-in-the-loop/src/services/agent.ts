/**
 * agent.ts — Agent 创建
 * 组合 model 和 tools 创建 LangChain Agent 实例。
 */
import { createAgent } from "langchain";
import { model } from "./model.js";
import { allTools } from "./tools.js";

/** 简单的工具调用 Agent */
export const simpleAgent = createAgent({
    model,
    tools: allTools,
    systemPrompt: `You are a helpful assistant with access to several specialized tools.`,
});
