import { tool } from "@langchain/core/tools";
import { getCurrentWeather, getForecastWeather } from "./qweatherClient";
import { z } from "zod";

export interface QueryWeatherInput {
    location: string;
    adm?: string;
    range?: string;
    lang?: string;
    mode?: "current" | "forecast";
    dayOffset?: 0 | 1 | 2;
};

export const queryWeather = tool(
    async (input: QueryWeatherInput) => {
        console.log(`[Tool] queryWeather called for: ${input.location}`);

        try {
            if (input.mode === "forecast") {
                return await getForecastWeather(input);
            }

            return await getCurrentWeather(input);
        } catch (error: any) {
            console.error("[Tool] queryWeather failed:", error);
            const message = error instanceof Error ? error.message : "Failed to query QWeather";
            throw new Error(
                `Weather lookup failed for "${input.location}": ${message}. Do not call get_weather again in this turn. Explain the failure to the user and ask for a more specific or supported location if needed.`,
            );
        }
    },
    {
        name: "query_weather",
        description: "Query weather for a location using QWeather. Prefer this tool for weather questions, including current conditions and short-term daily forecast like today, tomorrow, or the next 3 days. Do not use web_search for normal weather queries unless the user explicitly asks for web sources or news coverage.",
        schema: z.object({
            location: z.string().describe("City name, LocationID, or comma-separated longitude,latitude coordinates"),
            adm: z.string().optional().describe("Optional higher-level administrative region to disambiguate duplicate city names, for example Beijing or California"),
            range: z.string().optional().describe("Optional ISO 3166 country or region code to narrow the search, for example CN or US"),
            lang: z.string().optional().describe("Optional QWeather language code such as zh or en"),
            mode: z.enum(["current", "forecast"]).optional().describe("Use forecast for today/tomorrow/next 3 days; otherwise use current"),
            dayOffset: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional().describe("For forecast mode: 0 means today, 1 means tomorrow, 2 means the day after tomorrow"),
        }),
    }
);
