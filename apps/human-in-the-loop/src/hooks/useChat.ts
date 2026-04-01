/**
 * useChat.ts — 聊天初始化 Hook
 * 负责初始化 useStream 并将状态同步到 Zustand store。
 * 所有子组件通过 store 消费状态，不再需要 prop drilling。
 * 支持 Human-in-the-Loop（HITL）中断状态同步。
 */
import { useEffect, useCallback } from 'react';
import { useStream } from '@langchain/react';
import type { simpleAgent } from '../backend/services/ai/agent';
import { SERVER_URL, ASSISTANT_ID } from '../constants';
import { useAuthStore, useChatStore, useThreadStore, syncStreamData, syncStreamActions } from '../store';
import type { HITLRequest, HITLResponse } from '../types/interrupt';

/**
 * 初始化聊天流，并将状态同步到 Zustand store。
 * 只需在顶层组件中调用一次。
 */
export function useChat(): void {
    const fetchThreads = useThreadStore((s) => s.fetchThreads);
    const selectedThreadId = useThreadStore((s) => s.selectedThreadId);
    const setSelectedThreadId = useThreadStore((s) => s.setSelectedThreadId);
    const ensureThreadSession = useChatStore((s) => s.ensureThreadSession);
    const moveDraftSessionToThread = useChatStore((s) => s.moveDraftSessionToThread);
    const streamThreadId = useChatStore((s) => s.streamThreadId);
    const pendingStreamCommand = useChatStore((s) => s.pendingStreamCommand);
    const clearPendingStreamCommand = useChatStore((s) => s.clearPendingStreamCommand);
    const logout = useAuthStore((s) => s.logout);
    const token = useAuthStore((s) => s.token);

    // ── 新线程创建时，自动选中并刷新侧边栏 ──
    const onThreadId = useCallback((threadId: string) => {
        moveDraftSessionToThread(threadId);
        setSelectedThreadId(threadId);
        fetchThreads();
    }, [moveDraftSessionToThread, setSelectedThreadId, fetchThreads]);

    // ── 流式输出完成后，刷新线程列表（更新标题等信息）──
    const onFinish = useCallback(() => {
        fetchThreads();
    }, [fetchThreads]);

    const stream = useStream<typeof simpleAgent>({
        apiUrl: SERVER_URL,
        assistantId: ASSISTANT_ID,
        threadId: streamThreadId,
        defaultHeaders: token ? { Authorization: `Bearer ${token}` } : undefined,
        onThreadId,
        onFinish,
        onError: async (error) => {
            if (error instanceof Error && /401|unauthorized/i.test(error.message)) {
                await logout();
            }
        },
    });

    // ── 初次加载时拉取线程列表 ──
    useEffect(() => {
        fetchThreads();
    }, [fetchThreads]);

    useEffect(() => {
        if (!selectedThreadId || selectedThreadId === streamThreadId) {
            return;
        }

        void ensureThreadSession(selectedThreadId);
    }, [ensureThreadSession, selectedThreadId, streamThreadId]);

    useEffect(() => {
        syncStreamData(streamThreadId, {
            messages: stream.messages,
            toolCalls: stream.toolCalls,
            isLoading: stream.isLoading,
            interrupt: stream.interrupt ? { value: stream.interrupt.value as HITLRequest } : null,
        });
    }, [streamThreadId, stream.messages, stream.toolCalls, stream.isLoading, stream.interrupt]);

    useEffect(() => {
        if (!pendingStreamCommand || pendingStreamCommand.threadId !== streamThreadId) {
            return;
        }

        switch (pendingStreamCommand.type) {
            case 'submitMessage':
                stream.submit({ messages: [{ type: 'human', content: pendingStreamCommand.text }] });
                break;
            case 'submitReview':
                stream.submit(null, { command: { resume: pendingStreamCommand.response as HITLResponse } });
                break;
        }

        clearPendingStreamCommand();
    }, [clearPendingStreamCommand, pendingStreamCommand, stream, streamThreadId]);

    useEffect(() => {
        syncStreamActions({
            submit: stream.submit,
            stop: stream.stop,
        });
    }, [stream.submit, stream.stop]);
}
