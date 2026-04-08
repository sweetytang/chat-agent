import { HumanMessage, AIMessage, BaseMessage, SystemMessage } from "@langchain/core/messages";
import { deserializeMessages, serializeMessages } from "./messageSerde.js";
import { MessageTypeEnum } from "@common/types";
import { HITLRequest, DecisionEnum } from "@common/types/interrupt";
import { IThreadDTO } from '@common/types/thread'
import { SendEvent } from "@backend/types";
import { isPresentationToolCall } from "../ai/tools/index.js";

export function rebuildHistory(thread: IThreadDTO): BaseMessage[] {
    return deserializeMessages(thread.values?.messages || []);
}

export function parseInputMessages(input: any): BaseMessage[] {
    if (!Array.isArray(input?.messages)) {
        return [];
    }

    return input.messages.flatMap((message: any) => {
        if (message?.type !== MessageTypeEnum.HUMAN) {
            return [];
        }

        return [new HumanMessage({ content: message.content, id: message.id })];
    });
}

export function getToolCalls(message: AIMessage): any[] {
    return Array.isArray((message as any).tool_calls) ? (message as any).tool_calls : [];
}

export function withoutSystemMessages(messages: BaseMessage[]): BaseMessage[] {
    if (!Array.isArray(messages)) {
        return [];
    }

    return SystemMessage.isInstance(messages[0]) ? messages.slice(1) : messages;
}

export function emitValues(messages: BaseMessage[], sendEvent: SendEvent) {
    sendEvent("values", {
        messages: serializeMessages(withoutSystemMessages(messages)),
    });
}

export function sanitizeMessagesForModel(messages: BaseMessage[]): BaseMessage[] {
    return messages.map((message) => {
        if (!AIMessage.isInstance(message)) {
            return message;
        }

        const toolCalls = Array.isArray((message as any).tool_calls) ? (message as any).tool_calls : [];
        const invalidToolCalls = Array.isArray((message as any).invalid_tool_calls) ? (message as any).invalid_tool_calls : [];
        const safeToolCalls = toolCalls.filter((toolCall: any) => !isPresentationToolCall(toolCall));
        const safeInvalidToolCalls = invalidToolCalls.filter((toolCall: any) => !isPresentationToolCall(toolCall));

        if (safeToolCalls.length === toolCalls.length && safeInvalidToolCalls.length === invalidToolCalls.length) {
            return message;
        }

        return new AIMessage({
            content: message.content,
            id: message.id,
            ...(typeof (message as any).name === "string" ? { name: (message as any).name } : {}),
            ...((message as any).additional_kwargs ? { additional_kwargs: (message as any).additional_kwargs } : {}),
            ...((message as any).response_metadata ? { response_metadata: (message as any).response_metadata } : {}),
            ...((message as any).usage_metadata ? { usage_metadata: (message as any).usage_metadata } : {}),
            ...(safeToolCalls.length > 0 ? { tool_calls: safeToolCalls as any } : {}),
            ...(safeInvalidToolCalls.length > 0 ? { invalid_tool_calls: safeInvalidToolCalls as any } : {}),
        } as any);
    });
}

export function buildHITLRequest(toolCalls: any[]): HITLRequest {
    return {
        requestId: toolCalls
            .map((toolCall: any, index: number) => toolCall.id || `${toolCall.name || "tool"}-${index}`)
            .join("|"),
        actionRequests: toolCalls.map((toolCall: any) => ({
            action: toolCall.name,
            args: toolCall.args || {},
            description: `Agent 请求调用工具: ${toolCall.name}`,
        })),
        reviewConfigs: toolCalls.map(() => ({
            allowedDecisions: [DecisionEnum.APPROVE, DecisionEnum.REJECT, DecisionEnum.EDIT],
        })),
    };
}
