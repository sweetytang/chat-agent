/**
 * chatStore.ts — Chat 流式状态管理
 * 将 useStream 的流式状态同步到 Zustand，供各子组件直接消费，避免 prop drilling。
 *
 * 设计要点：
 * - 数据（messages / toolCalls / isLoading）放到 Zustand 状态中，变更会触发订阅组件更新。
 * - Action 函数（submit / stop / switchThread）通过模块级 ref 持有，
 *   更新它们不会引起 re-render，避免无限循环。
 */
import { create } from 'zustand';
import type { BaseMessage } from '@langchain/core/messages';
import type { ToolCallWithResult } from '@langchain/react';

/* ── 模块级 action refs（不在 Zustand state 中，更新不触发 re-render） ── */
let _submit: ((input: any) => void) | null = null;
let _stop: (() => void) | null = null;
let _switchThread: ((id: string | null) => void) | null = null;

interface ChatState {
    /** 当前消息列表 */
    messages: BaseMessage[];
    /** 工具调用结果列表 */
    toolCalls: ToolCallWithResult[];
    /** 是否正在加载/流式输出 */
    isLoading: boolean;
    /** 发送消息 */
    submitMessage: (text: string) => void;
    /** 停止生成 */
    stopMessage: () => void;
    /** 切换会话线程 */
    switchThread: (id: string | null) => void;
}

export const useChatStore = create<ChatState>(() => ({
    messages: [],
    toolCalls: [],
    isLoading: false,

    submitMessage: (text: string) => {
        if (!text.trim()) return;
        _submit?.({ messages: [{ type: 'human', content: text }] });
    },
    stopMessage: () => {
        _stop?.();
    },
    switchThread: (id: string | null) => {
        _switchThread?.(id);
    },
}));

/**
 * 同步流式数据到 store（仅在值变化时才调用 setState）。
 * 在 useEffect 中带依赖地调用，不会造成无限循环。
 */
export function syncStreamData(data: {
    messages: BaseMessage[];
    toolCalls: ToolCallWithResult[];
    isLoading: boolean;
}) {
    const current = useChatStore.getState();
    const updates: Partial<Pick<ChatState, 'messages' | 'toolCalls' | 'isLoading'>> = {};

    if (current.messages !== data.messages) updates.messages = data.messages;
    if (current.toolCalls !== data.toolCalls) updates.toolCalls = data.toolCalls;
    if (current.isLoading !== data.isLoading) updates.isLoading = data.isLoading;

    if (Object.keys(updates).length > 0) {
        useChatStore.setState(updates);
    }
}

/**
 * 更新 action refs。仅修改模块级变量，不触发任何 re-render。
 */
export function syncStreamActions(actions: {
    submit: (input: any) => void;
    stop: () => void;
    switchThread: (id: string | null) => void;
}) {
    _submit = actions.submit;
    _stop = actions.stop;
    _switchThread = actions.switchThread;
}
