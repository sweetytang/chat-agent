/**
 * threadStore.ts — Threads 状态管理
 * 管理对话线程列表、当前激活线程等状态。
 */
import { create } from 'zustand';
import { SERVER_URL } from '../constants';
import type { IThread } from '../types';

interface ThreadState {
    /** 线程列表 */
    threadsList: IThread[];
    /** 当前激活的线程 ID */
    activeThreadId: string | null;
    /** 从服务端拉取线程列表 */
    fetchThreads: () => Promise<void>;
    /** 设置当前激活线程 */
    setActiveThreadId: (id: string | null) => void;
    /** 自动选中第一个线程（在首次创建对话后使用） */
    autoSelectFirstThread: () => void;
    /** 删除一个线程 */
    deleteThread: (id: string) => Promise<void>;
}

export const useThreadStore = create<ThreadState>((set, get) => ({
    threadsList: [],
    activeThreadId: null,

    fetchThreads: async () => {
        try {
            const res = await fetch(`${SERVER_URL}/allthreads`);
            const data = await res.json();
            set({ threadsList: data });
        } catch (e) {
            console.error('Failed to fetch threads', e);
        }
    },

    setActiveThreadId: (id) => {
        set({ activeThreadId: id });
    },

    autoSelectFirstThread: () => {
        const { activeThreadId, threadsList } = get();
        if (activeThreadId === null && threadsList.length > 0) {
            set({ activeThreadId: threadsList[0].thread_id });
        }
    },

    deleteThread: async (id: string) => {
        try {
            const res = await fetch(`${SERVER_URL}/threads/${id}`, { method: 'DELETE' });
            if (res.ok) {
                // Remove from local list
                const current = get();
                const updatedList = current.threadsList.filter(t => t.thread_id !== id);
                
                // Clear active thread if it was deleted
                const newActiveId = current.activeThreadId === id ? null : current.activeThreadId;
                
                set({ 
                    threadsList: updatedList,
                    activeThreadId: newActiveId
                });
            }
        } catch (e) {
            console.error('Failed to delete thread', e);
        }
    }
}));
