import type { RunMetadata } from "@common/types/run";

export type ModelRuntimeOptions = Pick<RunMetadata, "deepThinkingEnabled" | "generativeUiEnabled" | "structuredOutputEnabled">;

type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
type ReasoningSummary = "auto" | "concise" | "detailed";

type ReasoningConfig = {
    effort?: ReasoningEffort | null;
    summary?: ReasoningSummary | null;
};

const REASONING_MODEL_PREFIXES = ["o1", "o3", "o4", "gpt-5", "computer-use-preview"];

export function getConfiguredModelName(): string {
    if (!process.env.OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY in .env");
    if (!process.env.MODEL_NAME?.trim()) throw new Error("Missing MODEL_NAME in .env");
    return (process.env.MODEL_NAME as string).trim();
}

export function getConfiguredBaseUrl(): string {
    return process.env.OPENAI_BASE_URL?.trim().replace(/\/+$/, "") ?? "";
}

export function isReasoningModel(modelName: string): boolean {
    const name = modelName.trim().toLowerCase();
    return REASONING_MODEL_PREFIXES.some((prefix) => name.startsWith(prefix));
}

export function buildReasoningConfig(modelName: string): ReasoningConfig | undefined {
    if (!isReasoningModel(modelName)) return undefined;

    const effort = process.env.MODEL_REASONING_EFFORT?.trim().toLowerCase();
    const summary = process.env.MODEL_REASONING_SUMMARY?.trim().toLowerCase();

    return {
        effort: (["none", "minimal", "low", "medium", "high", "xhigh"].includes(effort ?? "") ? effort as ReasoningEffort : undefined) ?? "medium",
        summary: (["auto", "concise", "detailed"].includes(summary ?? "") ? summary as ReasoningSummary : undefined) ?? "auto",
    };
}

export function isDeepSeekProviderConfigured(
    modelName = getConfiguredModelName(),
    baseUrl = getConfiguredBaseUrl(),
): boolean {
    const isDeepSeekUrl = (() => {
        if (!baseUrl) return false;
        try { return new URL(baseUrl).hostname.trim().toLowerCase() === "api.deepseek.com"; }
        catch { return false; }
    })();
    return isDeepSeekUrl || modelName.trim().toLowerCase().startsWith("deepseek-");
}

export function isDeepSeekThinkingModeEnabled(
    runtimeOptions: ModelRuntimeOptions = {},
    modelName = getConfiguredModelName(),
    baseUrl = getConfiguredBaseUrl(),
): boolean {
    if (!isDeepSeekProviderConfigured(modelName, baseUrl)) return false;
    if (typeof runtimeOptions.deepThinkingEnabled === "boolean") return runtimeOptions.deepThinkingEnabled;

    const envVal = process.env.DEEPSEEK_THINKING_TYPE?.trim().toLowerCase();
    if (envVal === "enabled" || envVal === "disabled") return envVal === "enabled";

    return false;
}

export function shouldUseResponsesApi(
    modelName: string,
    reasoning: ReasoningConfig | undefined,
    baseUrl = getConfiguredBaseUrl(),
): boolean {
    const isCompatibleHost = (() => {
        if (!baseUrl) return true;
        try {
            const hostname = new URL(baseUrl).hostname.trim().toLowerCase();
            return hostname === "api.openai.com" || hostname.endsWith(".openai.azure.com");
        } catch { return false; }
    })();
    if (!isCompatibleHost) return false;

    const envVal = process.env.MODEL_USE_RESPONSES_API?.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(envVal ?? "")) return true;
    if (["0", "false", "no", "off"].includes(envVal ?? "")) return false;

    return isReasoningModel(modelName) || Boolean(reasoning?.summary);
}
