import { request } from "@/shared/http/client";
import type { ThreadHistory } from "@/modules/threads/types/history";
import type { ThreadSummary } from "@/modules/threads/types/thread";

export const listThreads = () => request<ThreadSummary[]>("/threads");

export const createThread = (title?: string) => request<ThreadSummary>(
  "/threads",
  { method: "POST", body: JSON.stringify({ title }) },
);

export const getThreadHistory = (threadId: string) => request<ThreadHistory>(
  `/threads/${threadId}/history`,
);
