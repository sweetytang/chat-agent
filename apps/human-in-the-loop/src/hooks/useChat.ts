/**
 * useChat.ts — 聊天初始化 Hook
 * 二期后仅负责聊天页的基础初始化与线程 hydrate。
 */
import { useEffect } from 'react';
import { useChatStore, useThreadStore } from '../store';

/**
 * 初始化聊天流，并将状态同步到 Zustand store。
 * 只需在顶层组件中调用一次。
 */
export function useChat(): void {
    const fetchThreads = useThreadStore((s) => s.fetchThreads);
    const selectedThreadId = useThreadStore((s) => s.selectedThreadId);
    const ensureThreadSession = useChatStore((s) => s.ensureThreadSession);

    // ── 初次加载时拉取线程列表 ──
    useEffect(() => {
        fetchThreads();
    }, [fetchThreads]);

    useEffect(() => {
        if (!selectedThreadId) {
            return;
        }

        void ensureThreadSession(selectedThreadId);
    }, [ensureThreadSession, selectedThreadId]);
}
