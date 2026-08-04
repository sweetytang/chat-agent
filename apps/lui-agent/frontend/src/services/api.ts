import {
  clearAuthSession,
  getAccessToken,
  getRefreshToken,
  notifyAuthExpired,
  saveAuthSession,
} from "@/services/authSession";
import type { ThreadHistory } from "@/types/history";

export const API_ROOT = import.meta.env.VITE_API_ROOT ?? "http://localhost:8000/api";
export const RUN_STREAM_URL = import.meta.env.VITE_API_URL ?? `${API_ROOT}/runs/stream`;

let refreshPromise: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_ROOT}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!response.ok) {
        clearAuthSession();
        notifyAuthExpired();
        return null;
      }
      const result = await response.json() as AuthResponse;
      saveAuthSession(result.access_token, result.refresh_token ?? null);
      return result.access_token;
    } catch {
      clearAuthSession();
      notifyAuthExpired();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export async function fetchWithAuth(
  url: string,
  init: RequestInit = {},
  retryOnUnauthorized = true,
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const token = getAccessToken() ?? headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response = await fetch(url, { ...init, headers });
  if (response.status !== 401 || !retryOnUnauthorized) return response;

  const hadRefreshToken = Boolean(getRefreshToken());
  const refreshedToken = await refreshAccessToken();
  if (!refreshedToken) {
    if (token && !hadRefreshToken) {
      clearAuthSession();
      notifyAuthExpired();
    }
    return response;
  }
  headers.set("Authorization", `Bearer ${refreshedToken}`);
  response = await fetch(url, { ...init, headers });
  return response;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetchWithAuth(`${API_ROOT}${path}`, init, !path.startsWith("/auth/"));
  if (!response.ok) throw new Error(`请求失败（${response.status}）`);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function authRequest<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`请求失败（${response.status}）`);
  if (response.status === 204) return undefined as T;
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
export interface AuthResponse { access_token: string; refresh_token: string; token_type: string; }

export const api = {
  login: (email: string, password: string) => authRequest<AuthResponse>("/auth/token", { method: "POST", body: JSON.stringify({ email, password }) }),
  register: (email: string, password: string) => authRequest<AuthResponse>("/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: (refreshToken: string) => authRequest<void>("/auth/logout", { method: "POST", body: JSON.stringify({ refresh_token: refreshToken }) }),
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
