import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { TavilySearch } from "@langchain/tavily";

type WebSearchInput = {
    query: string;
    includeDomains?: string[];
    excludeDomains?: string[];
    searchDepth?: "basic" | "advanced";
    topic?: "general" | "news" | "finance";
    timeRange?: "day" | "week" | "month" | "year";
};

let tavilySearchTool: TavilySearch | null = null;

function getTavilySearchTool() {
    if (!process.env.TAVILY_API_KEY) {
        throw new Error("Missing TAVILY_API_KEY in .env");
    }

    if (!tavilySearchTool) {
        tavilySearchTool = new TavilySearch({
            tavilyApiKey: process.env.TAVILY_API_KEY,
            maxResults: 5,
            searchDepth: "advanced",
            topic: "general",
            includeAnswer: true,
            includeRawContent: false,
            name: "web_search",
            description: "Search the live web for current, factual information. Use this when you need recent news, up-to-date facts, or information beyond the model's built-in knowledge.",
        });
    }

    return tavilySearchTool;
}

export const webSearch = tool(
    async (input: WebSearchInput) => {
        console.log(`[Tool] webSearch called for: ${input.query}`);
        return getTavilySearchTool().invoke(input);
    },
    {
        name: "web_search",
        description: "Search the live web for current and factual information. Prefer this for recent events, changing facts, or when citations from web results are helpful.",
        schema: z.object({
            query: z.string().describe("The search query"),
            includeDomains: z.array(z.string()).optional().describe("Optional list of domains to include in results"),
            excludeDomains: z.array(z.string()).optional().describe("Optional list of domains to exclude from results"),
            searchDepth: z.enum(["basic", "advanced"]).optional().describe("Search depth; advanced is slower but usually more comprehensive"),
            topic: z.enum(["general", "news", "finance"]).optional().describe("Search topic"),
            timeRange: z.enum(["day", "week", "month", "year"]).optional().describe("Optional freshness filter for time-sensitive searches"),
        }),
    }
);
