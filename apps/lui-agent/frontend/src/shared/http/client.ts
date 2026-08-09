import {
  clearAuthSession,
  getAccessToken,
  getRefreshToken,
  notifyAuthExpired,
  saveAuthSession,
} from "@/shared/session/authSession";
import type { AuthResponse } from "@/modules/auth/types";

export const API_ROOT = import.meta.env.VITE_API_ROOT ?? "http://localhost:8000/api";

let refreshPromise: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    if (getAccessToken()) {
      clearAuthSession();
      notifyAuthExpired();
    }
    return null;
  }
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

  const refreshedToken = await refreshAccessToken();
  if (!refreshedToken) return response;
  headers.set("Authorization", `Bearer ${refreshedToken}`);
  response = await fetch(url, { ...init, headers });
  return response;
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetchWithAuth(`${API_ROOT}${path}`, init, !path.startsWith("/auth/"));
  if (!response.ok) throw new Error(`请求失败（${response.status}）`);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function authRequest<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`请求失败（${response.status}）`);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
