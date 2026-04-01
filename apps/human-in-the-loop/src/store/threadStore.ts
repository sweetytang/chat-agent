/**
 * threadStore.ts — Threads 状态管理
 * 管理对话线程列表、当前激活线程等状态。
 */
import { create } from 'zustand';
import { SERVER_URL } from '../constants';
import { getAuthHeaders } from '../utils/authClient';
import type { IThreadDTO } from '../types/thread';

interface ThreadState {
    /** 线程列表 */
    threadsList: IThreadDTO[];
    /** 当前选中的线程 ID */
    selectedThreadId: string | null;
    /** 从服务端拉取线程列表 */
    fetchThreads: () => Promise<void>;
    /** 设置当前选中的线程 */
    setSelectedThreadId: (id: string | null) => void;
    /** 自动选中第一个线程（在首次创建对话后使用） */
    autoSelectFirstThread: () => void;
    /** 删除一个线程 */
    deleteThread: (id: string) => Promise<void>;
}

export const useThreadStore = create<ThreadState>((set, get) => ({
    threadsList: [],
    selectedThreadId: null,

    fetchThreads: async () => {
        try {
            const res = await fetch(`${SERVER_URL}/allthreads`, {
                headers: getAuthHeaders(),
            });
            if (res.status === 401) {
                set({ threadsList: [], selectedThreadId: null });
                return;
            }
            const data = await res.json();
            set({ threadsList: data });
        } catch (e) {
            console.error('Failed to fetch threads', e);
        }
    },

    setSelectedThreadId: (id) => {
        set({ selectedThreadId: id });
    },

    autoSelectFirstThread: () => {
        const { selectedThreadId, threadsList } = get();
        if (selectedThreadId === null && threadsList.length > 0) {
            set({ selectedThreadId: threadsList[0].thread_id });
        }
    },

    deleteThread: async (id: string) => {
        try {
            const res = await fetch(`${SERVER_URL}/threads/${id}`, {
                method: 'DELETE',
                headers: getAuthHeaders(),
            });
            if (res.ok) {
                // Remove from local list
                const current = get();
                const updatedList = current.threadsList.filter(t => t.thread_id !== id);

                // Clear selected thread if it was deleted
                const newSelectedId = current.selectedThreadId === id ? null : current.selectedThreadId;

                set({
                    threadsList: updatedList,
                    selectedThreadId: newSelectedId
                });
            }
        } catch (e) {
            console.error('Failed to delete thread', e);
        }
    }
}));

export function resetThreadStore() {
    useThreadStore.setState({
        threadsList: [],
        selectedThreadId: null,
    });
}
