/**
 * useChat.ts — 聊天初始化 Hook
 * 负责初始化 useStream 并将状态同步到 Zustand store。
 * 所有子组件通过 store 消费状态，不再需要 prop drilling。
 * 支持 Human-in-the-Loop（HITL）中断状态同步。
 */
import { useEffect, useCallback } from 'react';
import { useStream } from '@langchain/react';
import { simpleAgent } from '../services/agent';
import { SERVER_URL, ASSISTANT_ID } from '../constants';
import { useThreadStore, syncStreamData, syncStreamActions } from '../store';
import type { HITLRequest } from '../types';

/**
 * 初始化聊天流，并将状态同步到 Zustand store。
 * 只需在顶层组件中调用一次。
 */
export function useChat(): void {
    const fetchThreads = useThreadStore((s) => s.fetchThreads);
    const setActiveThreadId = useThreadStore((s) => s.setActiveThreadId);

    // ── 新线程创建时，自动选中并刷新侧边栏 ──
    const onThreadId = useCallback((threadId: string) => {
        setActiveThreadId(threadId);
        fetchThreads();
    }, [setActiveThreadId, fetchThreads]);

    // ── 流式输出完成后，刷新线程列表（更新标题等信息）──
    const onFinish = useCallback(() => {
        fetchThreads();
    }, [fetchThreads]);

    const stream = useStream<typeof simpleAgent>({
        apiUrl: SERVER_URL,
        assistantId: ASSISTANT_ID,
        onThreadId,
        onFinish,
    });

    // ── 初次加载时拉取线程列表 ──
    useEffect(() => {
        fetchThreads();
    }, [fetchThreads]);

    useEffect(() => {
        syncStreamData({
            messages: stream.messages,
            toolCalls: stream.toolCalls,
            isLoading: stream.isLoading,
            interrupt: stream.interrupt ? { value: stream.interrupt.value as HITLRequest } : null,
        });
    }, [stream.messages, stream.toolCalls, stream.isLoading, stream.interrupt]);

    // ── 同步 action refs（不触发 re-render，在每次渲染时更新到最新引用）──
    syncStreamActions({
        submit: stream.submit,
        stop: stream.stop,
        switchThread: (id: string | null) => {
            stream.switchThread(id);
            setActiveThreadId(id);
            fetchThreads();
        },
    });
}
