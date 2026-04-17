import { ChatOpenAI, type BaseChatOpenAIFields } from "@langchain/openai";
import { getProviderConfig } from "./providers/config.js";
import type { RunMetadata } from "@common/types/run";

const modelInstances = new Map<string, ChatOpenAI>();

function createModelFields(runtimeOptions: RunMetadata = {}): BaseChatOpenAIFields {
    const providerConfig = getProviderConfig(runtimeOptions);

    return {
        model: providerConfig.modelName,
        apiKey: providerConfig.apiKey,
        ...(providerConfig.baseUrl
            ? {
                configuration: {
                    baseURL: providerConfig.baseUrl,
                },
            }
            : {}),
        ...(providerConfig.thinkingEnabled
            ? {
                temperature: 0,
                modelKwargs: {
                    thinking: {
                        type: "enabled",
                    },
                },
            }
            : {}),
    };
}

export function getModel(runtimeOptions: RunMetadata = {}): any {
    const cacheKey = JSON.stringify(getProviderConfig(runtimeOptions));
    if (modelInstances.has(cacheKey)) return modelInstances.get(cacheKey);

    const modelFields = createModelFields(runtimeOptions);
    const modelConfig = {
        ...modelFields,
        __includeRawResponse: true, // 加了这行才能展示思考
    };

    const modelInstance = new ChatOpenAI(modelConfig);
    modelInstances.set(cacheKey, modelInstance);

    return modelInstance;
}
