import type { RunMetadata } from "@common/types/run";

export type ModelRuntimeOptions = Pick<RunMetadata, "deepThinkingEnabled">;

type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
type ReasoningSummary = "auto" | "concise" | "detailed";

export type ReasoningConfig = {
    effort?: ReasoningEffort | null;
    summary?: ReasoningSummary | null;
};

const DEFAULT_REASONING_EFFORT: ReasoningEffort = "medium";
const DEFAULT_REASONING_SUMMARY: ReasoningSummary = "auto";
const REASONING_MODEL_PREFIXES = ["o1", "o3", "o4", "gpt-5", "computer-use-preview"];
const OPENAI_RESPONSES_HOSTS = ["api.openai.com"];
const DEEPSEEK_HOSTS = ["api.deepseek.com"];
const DEEPSEEK_REASONER_MODEL = "deepseek-reasoner";
const DEEPSEEK_CHAT_MODEL = "deepseek-chat";

function normalizeBaseUrl(value: string | undefined): string {
    return value?.trim().replace(/\/+$/, "") ?? "";
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
    if (!value) {
        return undefined;
    }

    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
        return true;
    }

    if (["0", "false", "no", "off"].includes(normalized)) {
        return false;
    }

    return undefined;
}

function parseDeepSeekThinkingType(value: string | undefined): "enabled" | "disabled" | undefined {
    if (!value) {
        return undefined;
    }

    const normalized = value.trim().toLowerCase();
    if (normalized === "enabled" || normalized === "disabled") {
        return normalized;
    }

    return undefined;
}

function parseReasoningEffort(value: string | undefined): ReasoningEffort | undefined {
    if (!value) {
        return undefined;
    }

    const normalized = value.trim().toLowerCase();
    if (["none", "minimal", "low", "medium", "high", "xhigh"].includes(normalized)) {
        return normalized as ReasoningEffort;
    }

    return undefined;
}

function parseReasoningSummary(value: string | undefined): ReasoningSummary | undefined {
    if (!value) {
        return undefined;
    }

    const normalized = value.trim().toLowerCase();
    if (["auto", "concise", "detailed"].includes(normalized)) {
        return normalized as ReasoningSummary;
    }

    return undefined;
}

function isOpenAiCompatibleResponsesBaseUrl(baseUrl: string): boolean {
    if (!baseUrl) {
        return true;
    }

    try {
        const { hostname } = new URL(baseUrl);
        const normalizedHostname = hostname.trim().toLowerCase();

        return OPENAI_RESPONSES_HOSTS.includes(normalizedHostname)
            || normalizedHostname.endsWith(".openai.azure.com");
    } catch {
        return false;
    }
}

function isDeepSeekBaseUrl(baseUrl: string): boolean {
    if (!baseUrl) {
        return false;
    }

    try {
        const { hostname } = new URL(baseUrl);
        return DEEPSEEK_HOSTS.includes(hostname.trim().toLowerCase());
    } catch {
        return false;
    }
}

function requireModelConfig() {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("Missing OPENAI_API_KEY in .env");
    }

    if (!process.env.MODEL_NAME?.trim()) {
        throw new Error("Missing MODEL_NAME in .env");
    }
}

export function getConfiguredModelName(): string {
    requireModelConfig();
    return (process.env.MODEL_NAME as string).trim();
}

export function getConfiguredBaseUrl(): string {
    return normalizeBaseUrl(process.env.OPENAI_BASE_URL);
}

export function isReasoningModel(modelName: string): boolean {
    const normalizedName = modelName.trim().toLowerCase();
    return REASONING_MODEL_PREFIXES.some((prefix) => normalizedName.startsWith(prefix));
}

export function buildReasoningConfig(modelName: string): ReasoningConfig | undefined {
    if (!isReasoningModel(modelName)) {
        return undefined;
    }

    return {
        effort: parseReasoningEffort(process.env.MODEL_REASONING_EFFORT) ?? DEFAULT_REASONING_EFFORT,
        summary: parseReasoningSummary(process.env.MODEL_REASONING_SUMMARY) ?? DEFAULT_REASONING_SUMMARY,
    };
}

export function isDeepSeekProviderConfigured(
    modelName = getConfiguredModelName(),
    baseUrl = getConfiguredBaseUrl(),
): boolean {
    return isDeepSeekBaseUrl(baseUrl) || modelName.trim().toLowerCase().startsWith("deepseek-");
}

export function isDeepSeekReasonerModel(modelName = getConfiguredModelName()): boolean {
    return modelName.trim().toLowerCase() === DEEPSEEK_REASONER_MODEL;
}

export function isDeepSeekThinkingModeEnabled(
    runtimeOptions: ModelRuntimeOptions = {},
    modelName = getConfiguredModelName(),
    baseUrl = getConfiguredBaseUrl(),
): boolean {
    if (!isDeepSeekProviderConfigured(modelName, baseUrl)) {
        return false;
    }

    if (isDeepSeekReasonerModel(modelName)) {
        return true;
    }

    if (typeof runtimeOptions.deepThinkingEnabled === "boolean") {
        return runtimeOptions.deepThinkingEnabled;
    }

    const envThinkingType = parseDeepSeekThinkingType(process.env.DEEPSEEK_THINKING_TYPE);
    if (envThinkingType !== undefined) {
        return envThinkingType === "enabled";
    }

    return modelName.trim().toLowerCase() === DEEPSEEK_CHAT_MODEL;
}

export function shouldUseResponsesApi(
    modelName: string,
    reasoning: ReasoningConfig | undefined,
    baseUrl = getConfiguredBaseUrl(),
): boolean {
    if (!isOpenAiCompatibleResponsesBaseUrl(baseUrl)) {
        return false;
    }

    const envOverride = parseBooleanEnv(process.env.MODEL_USE_RESPONSES_API);
    if (envOverride !== undefined) {
        return envOverride;
    }

    return isReasoningModel(modelName) || Boolean(reasoning?.summary);
}
