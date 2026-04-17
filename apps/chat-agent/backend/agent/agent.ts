import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { createAgent, createMiddleware, humanInTheLoopMiddleware } from "langchain";
import { z } from "zod";
import { getModel } from "./model";
import {
    allRuntimeTools,
    createPresentationToolMessage,
    executableTools,
    getExecutableToolCalls,
    getRuntimeTools,
} from "./tools/index.js";
import { BASE_SYSTEM_PROMPT, getSystemPrompt } from "@backend/constants";
import { DecisionEnum } from "@common/types/interrupt";
import type { RunMetadata } from '@common/types/run';

function createInterruptOnConfig() {
    return Object.fromEntries(executableTools.map((tool) => ([
        tool.name,
        {
            allowedDecisions: [DecisionEnum.APPROVE, DecisionEnum.REJECT, DecisionEnum.EDIT],
            description: `Agent 请求调用工具: ${tool.name}`,
        },
    ])));
}


const runtimeOptionMiddleware = createMiddleware({
    name: "runtimeOptionMiddleware",
    wrapModelCall: (request, handler) => {
        const runtimeOptions = request.runtime.context as RunMetadata ?? {};

        return handler({
            ...request,
            model: getModel(runtimeOptions),
            systemPrompt: getSystemPrompt(runtimeOptions),
            tools: getRuntimeTools(runtimeOptions),
        });
    },
});

const presentationToolMiddleware = createMiddleware({
    name: "presentationToolMiddleware",
    afterModel: {
        hook: (state) => {
            const messages = Array.isArray(state.messages) ? state.messages : [];
            const lastAiMessage = [...messages].reverse().find((message) => AIMessage.isInstance(message));
            if (!lastAiMessage) {
                return;
            }

            const toolCalls = Array.isArray(lastAiMessage.tool_calls)
                ? lastAiMessage.tool_calls
                : [];
            if (toolCalls.length === 0 || getExecutableToolCalls(toolCalls).length > 0) {
                return;
            }

            const toolMessages = toolCalls
                .map(createPresentationToolMessage)
                .filter(Boolean);
            if (toolMessages.length === 0) {
                return;
            }

            return {
                messages: toolMessages as ToolMessage[],
                jumpTo: "end",
            };
        },
        canJumpTo: ["end"],
    },
});




export const simpleAgent: ReturnType<typeof createAgent> = createAgent({
    model: getModel(),
    tools: allRuntimeTools,
    systemPrompt: BASE_SYSTEM_PROMPT,
    contextSchema: z.object({
        deepThinkingEnabled: z.boolean().optional(),
        generativeUiEnabled: z.boolean().optional(),
        structuredOutputEnabled: z.boolean().optional(),
    }),
    middleware: [
        runtimeOptionMiddleware,
        humanInTheLoopMiddleware({
            interruptOn: createInterruptOnConfig(),
            descriptionPrefix: "工具调用需要人工审核",
        }),
        presentationToolMiddleware,
    ],
});


