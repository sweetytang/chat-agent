import { normalizeBaseUrl } from "@backend/utils/normalizeBaseUrl.js";
import type { RunMetadata } from "@common/types/run";

interface ProviderConfig {
    apiKey: string;
    baseUrl: string;
    modelName: string;
    thinkingEnabled: boolean;
}

export function getProviderConfig(runtimeOptions: RunMetadata = {}): ProviderConfig {
    const apiKey = process.env["OPENAI_API_KEY"] ?? "";
    const modelName = process.env["MODEL_NAME"] ?? "";
    const baseUrl = normalizeBaseUrl(process.env.OPENAI_BASE_URL ?? "");
    const thinkingEnabled = runtimeOptions.deepThinkingEnabled ?? false;

    return {
        apiKey,
        baseUrl,
        modelName,
        thinkingEnabled,
    };
}
