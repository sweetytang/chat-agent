import type { ThreadHistory } from "@/types/history";

export const API_ROOT = import.meta.env.VITE_API_ROOT ?? "http://localhost:8000/api";
export const RUN_STREAM_URL = import.meta.env.VITE_API_URL ?? `${API_ROOT}/runs/stream`;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("lui-agent.access-token");
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`请求失败（${response.status}）`);
  return response.json() as Promise<T>;
}

export interface ThreadSummary { id: string; title: string | null; current_checkpoint_id: string | null; }
export interface CheckpointSummary { id: string; thread_id: string; parent_id: string | null; state: Record<string, unknown>; branch_name: string | null; }
export interface PendingInterruptResponse {
  request_id: string;
  run_id: string;
  kind: string;
  tool?: string | null;
  payload: Record<string, unknown>;
}
export interface AuthResponse { access_token: string; refresh_token?: string | null; token_type: string; }

export const api = {
  login: (email: string, password: string) => request<AuthResponse>("/auth/token", { method: "POST", body: JSON.stringify({ email, password }) }),
  register: (email: string, password: string) => request<AuthResponse>("/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }),
  listThreads: () => request<ThreadSummary[]>("/threads"),
  createThread: (title?: string) => request<ThreadSummary>("/threads", { method: "POST", body: JSON.stringify({ title }) }),
  getThreadHistory: (threadId: string) => request<ThreadHistory>(`/threads/${threadId}/history`),
  listCheckpoints: (threadId: string) => request<CheckpointSummary[]>(`/threads/${threadId}/checkpoints`),
  getPendingInterrupt: (threadId: string) => request<PendingInterruptResponse | null>(`/threads/${threadId}/interrupts/pending`),
  switchCheckpoint: (threadId: string, checkpointId: string) => request<unknown>(`/threads/${threadId}/checkpoints/${checkpointId}/switch`, { method: "POST" }),
  cancelRun: (runId: string) => request<{ run_id: string; status: string }>(`/runs/${runId}/cancel`, { method: "POST" }),
  resolveInterrupt: (requestId: string, decision: "approve" | "edit" | "reject") => request(`/interrupts/${requestId}/resolve`, { method: "POST", body: JSON.stringify({ decision }) }),
  resumeInterrupt: (requestId: string) => request(`/interrupts/${requestId}/resume`, { method: "POST" }),
};
