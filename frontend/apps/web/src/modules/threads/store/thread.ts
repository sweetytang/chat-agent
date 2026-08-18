import { create } from 'zustand';

import {
  listCheckpoints,
  switchCheckpoint as switchCheckpointRequest,
} from '@/modules/checkpoints/services/checkpointApi';
import type { CheckpointSummary } from '@/modules/checkpoints/types';
import { getPendingInterrupt } from '@/modules/interrupts/services/interruptApi';
import { abortActiveStream } from '@/modules/runs/domain/activeStream';
import { isActiveRunStatus } from '@/modules/runs/domain/status';
import { selectThreadRun, useRunStore } from '@/modules/runs/store/run';
import { createLatestRequestTracker } from '@/modules/threads/domain/latestRequest';
import {
  createThread as createThreadRequest,
  deleteThread as deleteThreadRequest,
  getThreadTimeline,
  listThreads,
  updateThread as updateThreadRequest,
} from '@/modules/threads/services/threadApi';
import type { ThreadSummary } from '@/modules/threads/types/thread';

const DEMO_THREAD_ID = 'demo-thread';

async function loadThreadSnapshot(threadId: string) {
  const [timeline, checkpoints, pendingInterrupt] = await Promise.all([
    getThreadTimeline(threadId),
    listCheckpoints(threadId),
    getPendingInterrupt(threadId),
  ]);
  return { timeline, checkpoints, pendingInterrupt };
}

let latestThreadsRequestId = 0; // 线程列表加载，过滤旧请求，只取最新结果；全局记录
let selectionVersion = 0; // 判断用户在异步操作期间是否改变过当前线程选择，处理异步竞态的“选择版本号”
const snapshotRequests = createLatestRequestTracker(); // 线程快照加载，过滤旧请求，只取最新结果；通过 Map<threadId, requestId> 按线程分别记录：

interface ThreadState {
  threadId: string;
  currentCheckpointId: string | null;
  title: string;
  threads: ThreadSummary[];
  checkpoints: CheckpointSummary[];
  refreshingThreads: Record<string, boolean>;
  isLoadingThreads: boolean;
  startNewThread: () => void;
  setCurrentThreadTitle: (title: string) => void;
  setThread: (threadId: string, title?: string, currentCheckpointId?: string | null) => void;
  loadThreads: () => Promise<void>;
  renameThread: (threadId: string, title: string) => Promise<void>;
  setThreadPinned: (threadId: string, isPinned: boolean) => Promise<void>;
  deleteThread: (threadId: string) => Promise<void>;
  createThread: (title?: string, migrateDemoProjection?: boolean) => Promise<ThreadSummary | null>;
  refreshThread: (threadId: string, preserveRunState?: boolean) => Promise<void>;
  refreshCurrentThread: (preserveRunState?: boolean) => Promise<void>;
  switchCheckpoint: (checkpointId: string) => Promise<void>;
}

export const useThreadStore = create<ThreadState>((set, get) => ({
  threadId: DEMO_THREAD_ID,
  currentCheckpointId: null,
  title: '未命名会话',
  threads: [],
  checkpoints: [],
  refreshingThreads: {},
  isLoadingThreads: true,

  startNewThread: () => {
    selectionVersion += 1;
    useRunStore.getState().resetThread(DEMO_THREAD_ID);
    set({
      threadId: DEMO_THREAD_ID,
      currentCheckpointId: null,
      title: '未命名会话',
      checkpoints: [],
    });
  },

  setCurrentThreadTitle: (title) =>
    set((state) => ({
      title,
      threads: state.threads.map((thread) =>
        thread.id === state.threadId ? { ...thread, title } : thread,
      ),
    })),

  setThread: (threadId, title = '未命名会话', currentCheckpointId = null) => {
    if (threadId === get().threadId) return;
    selectionVersion += 1;
    set({
      threadId,
      title,
      currentCheckpointId,
      checkpoints: [],
    });
    if (threadId !== DEMO_THREAD_ID) void get().refreshThread(threadId, true);
  },

  loadThreads: async () => {
    const requestId = ++latestThreadsRequestId;
    set({ isLoadingThreads: true });
    try {
      const threads = await listThreads();
      if (requestId !== latestThreadsRequestId) return;
      set((state) => {
        const current = threads.find((thread) => thread.id === state.threadId);
        return {
          threads,
          title:
            state.threadId === DEMO_THREAD_ID || current?.title == null
              ? state.title
              : current.title,
        };
      });
    } catch {
      if (requestId === latestThreadsRequestId) set({ threads: [] });
    } finally {
      if (requestId === latestThreadsRequestId) set({ isLoadingThreads: false });
    }
  },

  createThread: async (title, migrateDemoProjection = false) => {
    const selectedThreadId = get().threadId;

    const selectionVersionCache = selectionVersion;
    try {
      const thread = await createThreadRequest(title);
      if (migrateDemoProjection) useRunStore.getState().migrateThread(DEMO_THREAD_ID, thread.id);

      // 用户在创建请求期间切走时，不把页面强行切回新会话；运行仍会在新会话后台启动。
      // (创建线程接口速度很快，所以自动切换也很快)
      if (get().threadId === selectedThreadId && selectionVersion === selectionVersionCache) {
        selectionVersion += 1;
        set({
          threadId: thread.id,
          title: thread.title ?? title ?? '未命名会话',
          currentCheckpointId: thread.current_checkpoint_id,
          checkpoints: [],
        });
      }
      await get().loadThreads();
      return thread;
    } catch {
      return null;
    }
  },

  renameThread: async (threadId, title) => {
    const updated = await updateThreadRequest(threadId, { title });
    const threads = await listThreads();
    set((state) => ({
      threads,
      title: state.threadId === threadId ? (updated.title ?? '未命名会话') : state.title,
    }));
  },

  setThreadPinned: async (threadId, isPinned) => {
    await updateThreadRequest(threadId, { is_pinned: isPinned });
    set({ threads: await listThreads() });
  },

  deleteThread: async (threadId) => {
    const runState = selectThreadRun(useRunStore.getState(), threadId);
    if (isActiveRunStatus(runState.status)) throw new Error('运行中的会话不能删除');

    await deleteThreadRequest(threadId);
    const threads = await listThreads();
    abortActiveStream(threadId);
    useRunStore.getState().resetThread(threadId);
    snapshotRequests.clear(threadId);

    if (get().threadId !== threadId) {
      set({ threads });
      return;
    }

    selectionVersion += 1;
    const nextThread = threads[0];
    if (nextThread) {
      set({
        threads,
        threadId: nextThread.id,
        title: nextThread.title ?? '未命名会话',
        currentCheckpointId: nextThread.current_checkpoint_id,
        checkpoints: [],
      });
      await get().refreshThread(nextThread.id, true);
      return;
    }
    set({
      threadId: DEMO_THREAD_ID,
      currentCheckpointId: null,
      title: '未命名会话',
      threads: [],
      checkpoints: [],
    });
  },

  refreshThread: async (threadId, preserveRunState = false) => {
    if (threadId === DEMO_THREAD_ID) return;
    const requestId = snapshotRequests.start(threadId);
    set((state) => ({
      refreshingThreads: { ...state.refreshingThreads, [threadId]: true },
    }));
    try {
      const { timeline, checkpoints, pendingInterrupt } = await loadThreadSnapshot(threadId);
      if (!snapshotRequests.isLatest(threadId, requestId)) return;

      const runStore = useRunStore.getState();
      runStore.setTimeline(threadId, timeline.timeline, preserveRunState);
      runStore.setPendingApproval(threadId, pendingInterrupt, preserveRunState);
      if (get().threadId === threadId)
        set({ checkpoints, currentCheckpointId: timeline.current_checkpoint_id });
    } catch (error) {
      if (snapshotRequests.isLatest(threadId, requestId))
        useRunStore
          .getState()
          .setRunError(threadId, error instanceof Error ? error.message : '历史记录加载失败');
    } finally {
      if (snapshotRequests.isLatest(threadId, requestId))
        set((state) => ({
          refreshingThreads: { ...state.refreshingThreads, [threadId]: false },
        }));
    }
  },

  refreshCurrentThread: async (preserveRunState = false) => {
    await get().refreshThread(get().threadId, preserveRunState);
  },

  switchCheckpoint: async (checkpointId) => {
    const threadId = get().threadId;
    if (threadId === DEMO_THREAD_ID) return;
    if (isActiveRunStatus(selectThreadRun(useRunStore.getState(), threadId).status)) return;

    const requestId = snapshotRequests.start(threadId);
    set((state) => ({
      refreshingThreads: { ...state.refreshingThreads, [threadId]: true },
    }));
    try {
      await switchCheckpointRequest(threadId, checkpointId);
      const { timeline, checkpoints, pendingInterrupt } = await loadThreadSnapshot(threadId);
      if (!snapshotRequests.isLatest(threadId, requestId)) return;

      const runStore = useRunStore.getState();
      runStore.setTimeline(threadId, timeline.timeline);
      runStore.setPendingApproval(threadId, pendingInterrupt);
      if (get().threadId === threadId)
        set({ checkpoints, currentCheckpointId: timeline.current_checkpoint_id });
    } catch (error) {
      if (snapshotRequests.isLatest(threadId, requestId))
        useRunStore
          .getState()
          .setRunError(threadId, error instanceof Error ? error.message : '分支切换失败');
    } finally {
      if (snapshotRequests.isLatest(threadId, requestId))
        set((state) => ({
          refreshingThreads: { ...state.refreshingThreads, [threadId]: false },
        }));
    }
  },
}));
