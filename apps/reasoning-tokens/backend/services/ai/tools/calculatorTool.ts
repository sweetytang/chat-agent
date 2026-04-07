import { z } from "zod";
import { tool } from "@langchain/core/tools";

export const calculator = tool(
    async ({ expression }) => {
        console.log(`[Tool] calculator called for: ${expression}`);
        await new Promise((resolve) => setTimeout(resolve, 1000));

        try {
            // 注意：eval 仅用于 Demo 演示，生产环境应使用 Math.js 等安全库。
            // eslint-disable-next-line no-eval
            const result = eval(expression);
            return JSON.stringify({ result });
        } catch {
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
