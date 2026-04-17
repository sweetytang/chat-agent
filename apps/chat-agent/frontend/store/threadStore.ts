/**
 * threadStore.ts — Threads 状态管理
 * 管理对话线程列表、当前激活线程等状态。
 */
import { create } from 'zustand';
import { MessageTypeEnum } from '@common/types';
import { langGraphClient } from '@frontend/services/langgraph/client';

type ThreadItem = {
    thread_id: string;
    status: string;
    title: string;
    updated_at: string;
};

function extractThreadTitle(messages: any[]): string {
    const firstHumanMessage = messages.find((message: any) => message?.type === MessageTypeEnum.HUMAN);
    const content = firstHumanMessage?.content;

    if (typeof content === 'string') {
        return content.trim() || '新对话';
    }

    if (!Array.isArray(content)) {
        return '新对话';
    }

    const text = content
        .map((item) => {
            if (typeof item === 'string') {
                return item;
            }

            if (
                item
                && typeof item === 'object'
                && Object.prototype.hasOwnProperty.call(item, 'text')
                && typeof item.text === 'string'
            ) {
                return item.text;
            }

            return '';
        })
        .join(' ')
        .trim();

    return text || '新对话';
}

interface ThreadState {
    /** 线程列表 */
    threadsList: ThreadItem[];
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
            const threads = await langGraphClient.threads.search({
                limit: 100,
                sortBy: 'updated_at',
                sortOrder: 'desc',
                select: ['thread_id', 'updated_at', 'status', 'values'],
            });

            set({
                threadsList: threads.map((thread) => ({
                    thread_id: thread.thread_id,
                    updated_at: thread.updated_at,
                    status: thread.status,
                    title: extractThreadTitle((thread.values as { messages?: any[] } | undefined)?.messages ?? []),
                })),
            });
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
            await langGraphClient.threads.delete(id);

            const current = get();
            const updatedList = current.threadsList.filter((thread) => thread.thread_id !== id);
            const newSelectedId = current.selectedThreadId === id ? null : current.selectedThreadId;

            set({
                threadsList: updatedList,
                selectedThreadId: newSelectedId,
            });
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
