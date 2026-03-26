import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { getCurrentWeather } from "./qweatherClient.js";

type GetWeatherInput = {
    location: string;
    adm?: string;
    range?: string;
    lang?: string;
};

export const getWeather = tool(
    async (input: GetWeatherInput) => {
        console.log(`[Tool] getWeather called for: ${input.location}`);

        try {
            return await getCurrentWeather(input);
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
