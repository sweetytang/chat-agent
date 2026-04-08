import { ChatOpenAI } from "@langchain/openai";
import {
    buildReasoningConfig,
    getConfiguredBaseUrl,
    getConfiguredModelName,
    isDeepSeekProviderConfigured,
    isDeepSeekReasonerModel,
    isDeepSeekThinkingModeEnabled,
    isReasoningModel,
    type ModelRuntimeOptions,
    shouldUseResponsesApi,
} from "./providerConfig.js";
import { getRuntimeTools } from "./tools/index.js";

const modelInstances = new Map<string, ChatOpenAI>();
const modelWithToolsInstances = new WeakMap<ChatOpenAI, ReturnType<ChatOpenAI["bindTools"]>>();

function getModelCacheKey(runtimeOptions: ModelRuntimeOptions) {
    const modelName = getConfiguredModelName();
    const reasoning = buildReasoningConfig(modelName);
    const baseUrl = getConfiguredBaseUrl();
    const reasoningModel = isReasoningModel(modelName);
    const deepSeekThinkingMode = isDeepSeekThinkingModeEnabled(runtimeOptions, modelName, baseUrl);
    const useResponsesApi = shouldUseResponsesApi(modelName, reasoning, baseUrl);

    return JSON.stringify({
        baseUrl,
        deepSeekThinkingMode,
        generativeUiEnabled: runtimeOptions.generativeUiEnabled === true,
        modelName,
        reasoning,
        reasoningModel,
        structuredOutputEnabled: runtimeOptions.structuredOutputEnabled === true,
        useResponsesApi,
    });
}

export function getModel(runtimeOptions: ModelRuntimeOptions = {}) {
    const cacheKey = getModelCacheKey(runtimeOptions);
    const cachedModel = modelInstances.get(cacheKey);
    if (cachedModel) {
        return cachedModel;
    }

    const modelName = getConfiguredModelName();
    const reasoning = buildReasoningConfig(modelName);
    const reasoningModel = isReasoningModel(modelName);
    const baseUrl = getConfiguredBaseUrl();
    const deepSeekThinkingMode = isDeepSeekThinkingModeEnabled(runtimeOptions, modelName, baseUrl);
    const modelConfig: ConstructorParameters<typeof ChatOpenAI>[0] = {
        model: modelName,
        apiKey: process.env.OPENAI_API_KEY,
        ...(baseUrl
            ? {
                configuration: {
                    baseURL: baseUrl,
                },
            }
            : {}),
        ...(reasoningModel || deepSeekThinkingMode ? {} : { temperature: 0 }),
        ...(reasoning ? { reasoning } : {}),
        ...(deepSeekThinkingMode && !isDeepSeekReasonerModel(modelName)
            ? {
                modelKwargs: {
                    thinking: {
                        type: "enabled",
                    },
                },
            }
            : {}),
        ...(isDeepSeekProviderConfigured(modelName, baseUrl)
            ? { __includeRawResponse: true }
            : {}),
        ...(shouldUseResponsesApi(modelName, reasoning, baseUrl) ? { useResponsesApi: true } : {}),
    };

    const modelInstance = new ChatOpenAI(modelConfig);
    modelInstances.set(cacheKey, modelInstance);

    return modelInstance;
}

export function getModelWithTools(runtimeOptions: ModelRuntimeOptions = {}) {
    const model = getModel(runtimeOptions);
    const cachedModelWithTools = modelWithToolsInstances.get(model);
    if (cachedModelWithTools) {
        return cachedModelWithTools;
    }

    const modelWithToolsInstance = model.bindTools(getRuntimeTools(runtimeOptions));
    modelWithToolsInstances.set(model, modelWithToolsInstance);

    return modelWithToolsInstance;
}
