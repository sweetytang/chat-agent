const API_ROOT = import.meta.env.VITE_API_ROOT ?? "http://localhost:8000/api";

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
export interface MessageSummary { id: string; thread_id: string; run_id: string | null; checkpoint_id: string | null; role: "user" | "assistant" | "tool" | "system"; content: Record<string, unknown>; }
export interface AuthResponse { access_token: string; refresh_token?: string | null; token_type: string; }

export const api = {
  login: (email: string, password: string) => request<AuthResponse>("/auth/token", { method: "POST", body: JSON.stringify({ email, password }) }),
  register: (email: string, password: string) => request<AuthResponse>("/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }),
  listThreads: () => request<ThreadSummary[]>("/threads"),
  createThread: (title?: string) => request<ThreadSummary>("/threads", { method: "POST", body: JSON.stringify({ title }) }),
  listMessages: (threadId: string) => request<MessageSummary[]>(`/threads/${threadId}/messages`),
  listCheckpoints: (threadId: string) => request<CheckpointSummary[]>(`/threads/${threadId}/checkpoints`),
  switchCheckpoint: (threadId: string, checkpointId: string) => request<CheckpointSummary>(`/threads/${threadId}/checkpoints/${checkpointId}/switch`, { method: "POST" }),
  resolveInterrupt: (requestId: string, decision: "approve" | "edit" | "reject") => request(`/interrupts/${requestId}/resolve`, { method: "POST", body: JSON.stringify({ decision }) }),
  resumeInterrupt: (requestId: string) => request(`/interrupts/${requestId}/resume`, { method: "POST" }),
};
