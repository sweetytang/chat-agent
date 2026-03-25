/**
 * tools.ts — 工具定义
 * 集中管理所有可供 Agent 调用的工具（get_weather, calculator, web_search）。
 */
import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { ToolMessage } from '@langchain/core/messages';
import { createToolMessage } from '../../utils';
import { SendEvent, MessageTypeEnum } from '../types';

/** 天气查询工具（Mock） */
export const getWeather = tool(
    async ({ location }) => {
        console.log(`[Tool] getWeather called for: ${location}`);
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return JSON.stringify({
            temperature: Math.floor(Math.random() * 40) + 40,
            condition: ["Sunny", "Cloudy", "Raining", "Snowing"][Math.floor(Math.random() * 4)],
        });
    },
    {
        name: "get_weather",
        description: "Get the current weather for a location",
        schema: z.object({
            location: z.string().describe("City name"),
        }),
    }
);

/** 数学计算工具（Mock） */
export const calculator = tool(
    async ({ expression }) => {
        console.log(`[Tool] calculator called for: ${expression}`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        try {
            // 注意：eval 仅用于 Demo 演示，生产环境应使用 Math.js 等安全库
            // eslint-disable-next-line no-eval
            const result = eval(expression);
            return JSON.stringify({ result });
        } catch (e) {
            return JSON.stringify({ error: "Invalid expression" });
        }
    },
    {
        name: "calculator",
        description: "Evaluate a mathematical expression. Use this for ALL math, even simple 1+1.",
        schema: z.object({
            expression: z.string().describe("The math expression to evaluate, e.g., '2 + 2'"),
        }),
    }
);

/** 网页搜索工具（Mock） */
export const webSearch = tool(
    async ({ query }) => {
        console.log(`[Tool] webSearch called for: ${query}`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return JSON.stringify({
            results: [
                { title: `Result 1 for ${query}`, snippet: `This is a summary for ${query}...` },
                { title: `Result 2 for ${query}`, snippet: `Another relevant snippet about ${query}.` },
            ],
        });
    },
    {
        name: "web_search",
        description: "Search the web for information",
        schema: z.object({
            query: z.string().describe("The search query"),
        }),
    }
);

/** 所有工具列表，方便 Agent 统一引用 */
export const registeredTools = [getWeather, calculator, webSearch];



function sendToolMessage(sendEvent: SendEvent, message: ToolMessage) {
    sendEvent("messages", [{
        type: MessageTypeEnum.TOOL,
        id: message.id,
        content: message.content,
        tool_call_id: message.tool_call_id,
    }, {}]);
}

/**
 * 执行工具调用
 * 返回 ToolMessage 数组
 */
export async function executeTools(
    toolCalls: any[],
    sendEvent: SendEvent,
): Promise<ToolMessage[]> {
    const results: ToolMessage[] = [];

    for (const tc of toolCalls) {
        const tool = registeredTools.find((candidate: any) => candidate.name === tc.name);

        if (!tool) {
            const errorMessage = createToolMessage(`Tool "${tc.name}" not found`, tc.id);
            results.push(errorMessage);
            sendToolMessage(sendEvent, errorMessage);
            continue;
        }

        try {
            const result = await (tool as any).invoke(tc.args);
            const toolMessage = createToolMessage(
                typeof result === "string" ? result : JSON.stringify(result),
                tc.id,
            );
            results.push(toolMessage);
            sendToolMessage(sendEvent, toolMessage);
        } catch (err: any) {
            const errorMessage = createToolMessage(`Error: ${err.message}`, tc.id);
            results.push(errorMessage);
            sendToolMessage(sendEvent, errorMessage);
        }
    }

    return results;
}
