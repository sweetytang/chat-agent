// 中断状态缓存，当模型产生 tool_calls 时暂存到此处，等待用户审核
import { AIMessage, BaseMessage } from "@langchain/core/messages";
import { HITLRequest } from "../types";

export class InterruptCache {
    cache: Map<string, {
        /** HITL 请求载荷 */
        hitlRequest: HITLRequest;
        /** 被中断时的 AI 消息（完整的 AIMessage，包含 tool_calls） */
        aiMessage: AIMessage;
        /** 中断前已积累的所有消息（BaseMessage 数组） */
        allMessages: BaseMessage[];
    }> = new Map();

    set(key: string, value: {
        hitlRequest: HITLRequest;
        aiMessage: AIMessage;
        allMessages: BaseMessage[];
    }) {
        this.cache.set(key, value);
    }

    get(key: string) {
        return this.cache.get(key);
    }

    delete(key: string) {
        this.cache.delete(key);
    }
}

export const interruptCache = new InterruptCache();