import { Client } from "@langchain/langgraph-sdk";
import { SERVER_URL } from "@frontend/constants/server";

export const langGraphClient = new Client({
    apiUrl: SERVER_URL,
    apiKey: null,
});
