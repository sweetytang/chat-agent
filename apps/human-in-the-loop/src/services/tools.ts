/**
 * tools.ts — 工具定义
 * 集中管理所有可供 Agent 调用的工具（get_weather, calculator, web_search）。
 */
import path from "path";
import dotenv from "dotenv";
import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { TavilySearch } from "@langchain/tavily";
import { ToolMessage } from '@langchain/core/messages';
import { createToolMessage } from '../../utils';
import { SendEvent, MessageTypeEnum } from '../types';

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

type GetWeatherInput = {
    location: string;
    adm?: string;
    range?: string;
    lang?: string;
};

type QWeatherLocation = {
    name: string;
    id: string;
    lat?: string;
    lon?: string;
    adm1?: string;
    adm2?: string;
    country?: string;
    tz?: string;
    fxLink?: string;
};

type QWeatherLookupResponse = {
    code: string;
    location?: QWeatherLocation[];
    refer?: {
        sources?: string[];
        license?: string[];
    };
};

type QWeatherNowResponse = {
    code: string;
    updateTime?: string;
    fxLink?: string;
    now?: {
        obsTime?: string;
        temp?: string;
        feelsLike?: string;
        icon?: string;
        text?: string;
        windDir?: string;
        windScale?: string;
        windSpeed?: string;
        humidity?: string;
        precip?: string;
        pressure?: string;
        vis?: string;
        cloud?: string;
        dew?: string;
    };
    refer?: {
        sources?: string[];
        license?: string[];
    };
};

function getQWeatherApiHost() {
    const apiHost = process.env.QWEATHER_API_HOST?.trim();

    if (!apiHost) {
        throw new Error("Missing QWEATHER_API_HOST in .env");
    }

    const url = /^https?:\/\//i.test(apiHost) ? apiHost : `https://${apiHost}`;
    return url.replace(/\/+$/, "");
}

function getQWeatherApiKey() {
    const apiKey = process.env.QWEATHER_API_KEY?.trim();

    if (!apiKey) {
        throw new Error("Missing QWEATHER_API_KEY in .env");
    }

    return apiKey;
}

function toOptionalNumber(value?: string | null) {
    if (value === undefined || value === null || value === "") {
        return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function formatResolvedLocation(location: QWeatherLocation) {
    const parts = [location.name, location.adm2, location.adm1, location.country].filter(Boolean) as string[];
    return [...new Set(parts)].join(", ");
}

async function requestQWeather<T>(pathname: string, params: Record<string, string | undefined>): Promise<T> {
    const url = new URL(pathname, getQWeatherApiHost());

    Object.entries(params).forEach(([key, value]) => {
        if (value) {
            url.searchParams.set(key, value);
        }
    });

    const response = await fetch(url.toString(), {
        headers: {
            Accept: "application/json",
            "X-QW-Api-Key": getQWeatherApiKey(),
        },
    });

    const raw = await response.text();

    let data: any = {};
    try {
        data = raw ? JSON.parse(raw) : {};
    } catch {
        throw new Error(`QWeather returned a non-JSON response (HTTP ${response.status})`);
    }

    if (!response.ok) {
        throw new Error(`QWeather request failed with HTTP ${response.status}${data?.code ? ` (code ${data.code})` : ""}`);
    }

    if (data?.code && data.code !== "200") {
        throw new Error(`QWeather API returned code ${data.code}`);
    }

    return data as T;
}

async function resolveQWeatherLocation(input: GetWeatherInput) {
    const lookup = await requestQWeather<QWeatherLookupResponse>("/geo/v2/city/lookup", {
        location: input.location,
        adm: input.adm,
        range: input.range,
        number: "3",
        lang: input.lang ?? "zh",
    });

    const matchedLocation = lookup.location?.[0];
    if (!matchedLocation) {
        throw new Error(`QWeather could not resolve location "${input.location}"`);
    }

    return {
        matchedLocation,
        matchCount: lookup.location?.length ?? 0,
        refer: lookup.refer,
    };
}

/** 天气查询工具（QWeather 实时天气） */
export const getWeather = tool(
    async (input: GetWeatherInput) => {
        console.log(`[Tool] getWeather called for: ${input.location}`);

        try {
            const { matchedLocation, matchCount, refer: locationRefer } = await resolveQWeatherLocation(input);
            const weather = await requestQWeather<QWeatherNowResponse>("/v7/weather/now", {
                location: matchedLocation.id,
                lang: input.lang ?? "zh",
                unit: "m",
            });

            const current = weather.now;
            if (!current) {
                throw new Error(`QWeather returned no current weather for "${input.location}"`);
            }

            return {
                source: "QWeather",
                locationQuery: input.location,
                locationName: matchedLocation.name,
                resolvedLocation: formatResolvedLocation(matchedLocation),
                locationId: matchedLocation.id,
                latitude: toOptionalNumber(matchedLocation.lat),
                longitude: toOptionalNumber(matchedLocation.lon),
                timezone: matchedLocation.tz ?? null,
                condition: current.text ?? "Unknown",
                iconCode: current.icon ?? null,
                temperature: toOptionalNumber(current.temp),
                temperatureUnit: "Celsius",
                temperatureSymbol: "°C",
                feelsLike: toOptionalNumber(current.feelsLike),
                humidity: toOptionalNumber(current.humidity),
                windDirection: current.windDir ?? null,
                windScale: current.windScale ?? null,
                windSpeed: toOptionalNumber(current.windSpeed),
                windSpeedUnit: "km/h",
                pressure: toOptionalNumber(current.pressure),
                pressureUnit: "hPa",
                visibility: toOptionalNumber(current.vis),
                visibilityUnit: "km",
                precipitation: toOptionalNumber(current.precip),
                cloudCover: toOptionalNumber(current.cloud),
                dewPoint: toOptionalNumber(current.dew),
                observedAt: current.obsTime ?? null,
                updatedAt: weather.updateTime ?? null,
                fxLink: weather.fxLink ?? matchedLocation.fxLink ?? null,
                ambiguityNote: matchCount > 1
                    ? `Matched the top QWeather location for "${input.location}". Add adm or range to narrow ambiguous city names.`
                    : null,
                refer: weather.refer ?? locationRefer ?? null,
            };
        } catch (error: any) {
            console.error("[Tool] getWeather failed:", error);
            return {
                error: error instanceof Error ? error.message : "Failed to query QWeather",
                source: "QWeather",
                locationQuery: input.location,
            };
        }
    },
    {
        name: "get_weather",
        description: "Get the current real-time weather for a location using QWeather. Use this when the user asks about current conditions, temperature, humidity, wind, or similar live weather details.",
        schema: z.object({
            location: z.string().describe("City name, LocationID, or comma-separated longitude,latitude coordinates"),
            adm: z.string().optional().describe("Optional higher-level administrative region to disambiguate duplicate city names, for example Beijing or California"),
            range: z.string().optional().describe("Optional ISO 3166 country or region code to narrow the search, for example CN or US"),
            lang: z.string().optional().describe("Optional QWeather language code such as zh or en"),
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



/** 网页搜索工具（Tavily / LangChain 官方集成） */
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

/** 网页搜索工具（Tavily / LangChain 官方集成） */
export const webSearch = tool(
    async (input: WebSearchInput) => {
        console.log(`[Tool] webSearch called for: ${input.query}`);
        const tavily = getTavilySearchTool();
        return tavily.invoke(input);
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
