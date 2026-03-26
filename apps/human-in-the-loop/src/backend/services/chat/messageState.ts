import { HumanMessage, AIMessage, BaseMessage, SystemMessage } from "@langchain/core/messages";
import { deserializeMessages, serializeMessages } from "./messageSerde.js";
import { MessageTypeEnum, SendEvent } from "../../../types";
import { HITLRequest, DecisionEnum } from "../../../types/interrupt";
import { IThreadDTO } from '../../../types/thread'

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
