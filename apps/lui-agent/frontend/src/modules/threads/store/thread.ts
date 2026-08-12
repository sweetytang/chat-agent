import { create } from 'zustand';

import {
  listCheckpoints,
  switchCheckpoint as switchCheckpointRequest,
} from '@/modules/checkpoints/services/checkpointApi';
import type { CheckpointSummary } from '@/modules/checkpoints/types';
import { getPendingInterrupt } from '@/modules/interrupts/services/interruptApi';
import { useRunStore } from '@/modules/runs/store/run';
import { getThreadHistory, listThreads } from '@/modules/threads/services/threadApi';
import type { ThreadSummary } from '@/modules/threads/types/thread';

async function loadThreadSnapshot(threadId: string) {
  const [history, checkpoints, pendingInterrupt] = await Promise.all([
    getThreadHistory(threadId),
    listCheckpoints(threadId),
    getPendingInterrupt(threadId),
  ]);
  return { history, checkpoints, pendingInterrupt };
}

interface ThreadState {
  threadId: string;
  currentCheckpointId: string | null;
  title: string;
  threads: ThreadSummary[];
  checkpoints: CheckpointSummary[];
  isRefreshing: boolean;
  setThread: (threadId: string, title?: string, currentCheckpointId?: string | null) => void;
  loadThreads: () => Promise<void>;
  refreshCurrentThread: (preserveRunState?: boolean) => Promise<void>;
  switchCheckpoint: (checkpointId: string) => Promise<void>;
}

export const useThreadStore = create<ThreadState>((set, get) => ({
  threadId: 'demo-thread',
  currentCheckpointId: null,
  title: '新对话',
  threads: [],
  checkpoints: [],
  isRefreshing: false,
  setThread: (threadId, title = '新对话', currentCheckpointId = null) => {
    if (threadId === get().threadId) return;
    useRunStore.getState().reset();
    set({
      threadId,
      title,
      currentCheckpointId,
      checkpoints: [],
      isRefreshing: threadId !== 'demo-thread',
    });
  },
  loadThreads: async () => {
    try {
      set({ threads: await listThreads() });
    } catch {
      set({ threads: [] });
    }
  },
  refreshCurrentThread: async (preserveRunState = false) => {
    const threadId = get().threadId;
    if (threadId === 'demo-thread') return;
    set({ isRefreshing: true });
    try {
      const { history, checkpoints, pendingInterrupt } = await loadThreadSnapshot(threadId);
      if (get().threadId !== threadId) return;
      set({ checkpoints, currentCheckpointId: history.current_checkpoint_id });
      const runStore = useRunStore.getState();
      runStore.setHistory(history.messages, preserveRunState);
      runStore.setPendingApproval(pendingInterrupt, preserveRunState);
    } catch (error) {
      if (get().threadId === threadId) {
        useRunStore.setState({
          error: error instanceof Error ? error.message : '历史记录加载失败',
        });
      }
    } finally {
      if (get().threadId === threadId) set({ isRefreshing: false });
    }
  },
  switchCheckpoint: async (checkpointId) => {
    const threadId = get().threadId;
    if (threadId === 'demo-thread') return;
    set({ isRefreshing: true });
    try {
      await switchCheckpointRequest(threadId, checkpointId);
      const { history, checkpoints, pendingInterrupt } = await loadThreadSnapshot(threadId);
      if (get().threadId !== threadId) return;
      set({ checkpoints, currentCheckpointId: history.current_checkpoint_id });
      const runStore = useRunStore.getState();
      runStore.setHistory(history.messages);
      runStore.setPendingApproval(pendingInterrupt);
    } catch (error) {
      if (get().threadId === threadId) {
        useRunStore.setState({ error: error instanceof Error ? error.message : '分支切换失败' });
      }
    } finally {
      if (get().threadId === threadId) set({ isRefreshing: false });
    }
  },
}));
