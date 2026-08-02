import { create } from "zustand";
import { api, type CheckpointSummary, type ThreadSummary } from "@/services/api";

interface ThreadState {
  threadId: string;
  currentCheckpointId: string | null;
  title: string;
  threads: ThreadSummary[];
  checkpoints: CheckpointSummary[];
  setThread: (threadId: string, title?: string) => void;
  loadThreads: () => Promise<void>;
  loadCheckpoints: () => Promise<void>;
  switchCheckpoint: (checkpointId: string) => Promise<void>;
}

export const useThreadStore = create<ThreadState>((set) => ({
  threadId: "demo-thread", currentCheckpointId: null, title: "新对话", threads: [], checkpoints: [],
  setThread: (threadId, title = "新对话") => set({ threadId, title, currentCheckpointId: null, checkpoints: [] }),
  loadThreads: async () => {
    try { set({ threads: await api.listThreads() }); } catch { set({ threads: [] }); }
  },
  loadCheckpoints: async () => {
    const threadId = useThreadStore.getState().threadId;
    if (threadId === "demo-thread") return;
    try {
      const checkpoints = await api.listCheckpoints(threadId);
      set({ checkpoints, currentCheckpointId: checkpoints.at(-1)?.id ?? null });
    } catch { set({ checkpoints: [], currentCheckpointId: null }); }
  },
  switchCheckpoint: async (checkpointId) => {
    const threadId = useThreadStore.getState().threadId;
    if (threadId === "demo-thread") return;
    const checkpoint = await api.switchCheckpoint(threadId, checkpointId);
    set({ currentCheckpointId: checkpoint.id });
  },
}));
