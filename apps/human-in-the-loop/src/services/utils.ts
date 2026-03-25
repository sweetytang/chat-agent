/** --------------------- 工具函数 --------------------- */
import { Response } from 'express';
import { HumanMessage, AIMessage, SystemMessage, BaseMessage, ToolMessage, AIMessageChunk } from '@langchain/core/messages';
import { modelWithTools } from './model';
import { threadPool } from './thread.js';
import { interruptCache } from './interrupt.js';
import { uuid } from '../../utils'
import { IObj, IThread, HITLRequest, HITLResponse, SendEvent, MessageTypeEnum, DecisionEnum } from '../types';

// 提取对话标题
export function extractThreadTitle(messages: any[]): string {
    const firstHumanMessage = messages.find((m: any) => m.type === MessageTypeEnum.HUMAN);
    const content = firstHumanMessage?.content;
    let text = '';
    if (typeof content === 'string') {
        text = content.trim();
    } else if (Array.isArray(content)) {
        text = content
            .map((item) => {
                if (typeof item === 'string') return item;
                if (item && typeof item === 'object' && Object.prototype.hasOwnProperty.call(item, 'text') && typeof item.text === 'string') {
                    return item.text;
                }
                return '';
            })
            .join(' ')
            .trim();
    }
    return text || '新对话';
}

/**
 * 将 BaseMessage[] 序列化为普通对象数组
 * 提取 type、content、id、tool_calls、tool_call_id 关键字段
 */
export function serializeMessages(messages: BaseMessage[]): any[] {
    return messages.map((msg: any) => {
        const {
            type = msg._getType(),
            content,
            id = uuid(),
            tool_calls,
            tool_call_id,
        } = msg || {};
        return {
            type,
            content,
            id,
            tool_calls,
            tool_call_id,
        };
    });
}

// SSE 事件发送器
export function createSendEvent(res: Response): SendEvent {
    return (event: string, data: IObj | null) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
}

// 从线程恢复历史消息为 BaseMessage 实例
export function rebuildHistory(thread: IThread): BaseMessage[] {
    return (thread.values?.messages || []).map((msg: any) => {
        const { type, content, id, tool_calls, tool_call_id } = msg || {};
        const safeToolCalls = Array.isArray(tool_calls) ? tool_calls : [];
        switch (type) {
            case MessageTypeEnum.HUMAN:
                return new HumanMessage({ content, id });
            case MessageTypeEnum.AI:
                return new AIMessage({ content, id, tool_calls: safeToolCalls });
            case MessageTypeEnum.TOOL:
                return new ToolMessage({ content, id, tool_call_id });
            default:
                return new HumanMessage({ content, id });
        }
    });
}

// 解析请求中的输入消息
export function parseInputMessages(input: any): BaseMessage[] {
    if (!Array.isArray(input?.messages)) return [];

    const inputMessages: BaseMessage[] = [];
    for (const msg of input.messages) {
        const { content, id } = msg || {};

        // 对外聊天接口只接受 human 消息，AI / tool 消息由服务端内部维护。
        if (msg?.type === MessageTypeEnum.HUMAN) {
            inputMessages.push(new HumanMessage({ content, id }));
        }
    }

    return inputMessages;
}


export function getToolCalls(message: AIMessage): any[] {
    return Array.isArray((message as any).tool_calls) ? (message as any).tool_calls : [];
}


export function withoutSystemMessages(messages: BaseMessage[]): BaseMessage[] {
    if (!Array.isArray(messages)) return [];
    return SystemMessage.isInstance(messages[0]) ? messages.slice(1) : messages;
}


export function emitValues(messages: BaseMessage[], sendEvent: SendEvent) {
    sendEvent('values', { messages: serializeMessages(withoutSystemMessages(messages)) })
}


// 根据 tool_calls 构建 HITL 中断请求
export function buildHITLRequest(toolCalls: any[]): HITLRequest {
    return {
        requestId: toolCalls
            .map((tc: any, index: number) => tc.id || `${tc.name || 'tool'}-${index}`)
            .join('|'),
        actionRequests: toolCalls.map((tc: any) => ({
            action: tc.name,
            args: tc.args || {},
            description: `Agent 请求调用工具: ${tc.name}`,
        })),
        reviewConfigs: toolCalls.map(() => ({
            allowedDecisions: [DecisionEnum.APPROVE, DecisionEnum.REJECT, DecisionEnum.EDIT],
        })),
    };
}


/**
 * 调用模型（流式），返回完整的 AI 消息
 * 同时通过 SSE 向客户端推送流式 chunks
 */
export async function streamModelCall(
    messages: BaseMessage[],
    sendEvent: SendEvent,
): Promise<AIMessage> {
    const stream = await modelWithTools.stream(messages);

    const fallbackId = uuid();
    let mergedChunk: AIMessageChunk | null = null;

    const mergeChunk = (current: AIMessageChunk | null, next: AIMessageChunk): AIMessageChunk => {
        if (!current) return next;
        if (typeof current.concat !== 'function') {
            throw new Error('AIMessageChunk.concat is unavailable while merging streamed model chunks');
        }
        return current.concat(next);
    };

    const buildStreamPayload = (current: AIMessageChunk, full: AIMessageChunk) => ({
        type: MessageTypeEnum.AI,
        id: full.id || fallbackId,
        content: typeof current.content === 'string' ? current.content : '',
        // tool_calls 表示到当前为止已聚合出的完整工具调用结构
        tool_calls: full.tool_calls ?? [],
        // tool_call_chunks 只发送本次 chunk 的增量，交给前端 SDK 继续拼装
        tool_call_chunks: current.tool_call_chunks ?? [],
    });

    const buildFinalAIMessage = (fullChunk: AIMessageChunk | null): AIMessage => {
        if (!fullChunk) {
            return new AIMessage({
                id: fallbackId,
                content: '',
                tool_calls: [],
            });
        }

        return new AIMessage({
            id: fullChunk.id || fallbackId,
            content: typeof fullChunk.content === 'string' ? fullChunk.content : '',
            tool_calls: fullChunk.tool_calls ?? [],
        });
    };

    for await (const chunk of stream) {
        mergedChunk = mergeChunk(mergedChunk, chunk);
        sendEvent('messages', [buildStreamPayload(chunk, mergedChunk), {}]);
    }

    return buildFinalAIMessage(mergedChunk);
}



export async function modelCallAgent(params: {
    messages: BaseMessage[];
    threadId: string;
    status?: string;
    sendEvent: SendEvent;
}) {
    const {
        messages,
        threadId,
        status = 'idle',
        sendEvent
    } = params;
    // 发送当前状态，同步前端用户消息上屏
    emitValues(messages, sendEvent);
    const aiResponse = await streamModelCall(messages, sendEvent);
    messages.push(aiResponse);
    emitValues(messages, sendEvent);
    sendEvent('end', null);

    const toolCalls = getToolCalls(aiResponse);
    if (toolCalls.length > 0) {
        interruptCache.set(threadId, {
            hitlRequest: buildHITLRequest(getToolCalls(aiResponse)),
            aiMessage: aiResponse,
            allMessages: messages,
        });
        console.log(`[HITL] Thread ${threadId} interrupted — ${toolCalls.length} tool(s) pending review`);
    }

    /** 更新线程状态并持久化 */
    const thread = threadPool.get(threadId)!;
    thread.values = { messages: serializeMessages(withoutSystemMessages(messages)) };
    thread.updated_at = new Date().toISOString();
    thread.status = status;
}