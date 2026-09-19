import type { AuthResponse } from '@/modules/auth/types';
import {
  clearAuthSession,
  getAccessToken,
  getRefreshToken,
  notifyAuthExpired,
  saveAuthSession,
} from '@/shared/session/authSession';

declare global {
  interface Window {
    __OPEN_AGENT_CONFIG__?: {
      apiRoot?: string;
      streamUrl?: string;
    };
    __LUI_CONFIG__?: {
      apiRoot?: string;
      streamUrl?: string;
    };
  }
}

export function getApiRoot(): string {
  if (typeof window !== 'undefined') {
    if (window.__OPEN_AGENT_CONFIG__?.apiRoot) {
      return window.__OPEN_AGENT_CONFIG__.apiRoot.replace(/\/+$/, '');
    }
    const stored = localStorage.getItem('open-agent:api-root')
    if (stored) {
      return stored.replace(/\/+$/, '');
    }
  }
  const envRoot = import.meta.env.OPEN_AGENT_API_ROOT ?? import.meta.env.VITE_API_ROOT;
  if (envRoot) {
    return envRoot.replace(/\/+$/, '');
  }
  return '/api';
}

export const API_ROOT = getApiRoot();

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
      const response = await fetch(`${getApiRoot()}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!response.ok) {
        clearAuthSession();
        notifyAuthExpired();
        return null;
      }
      const result = (await response.json()) as AuthResponse;
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
  headers.set('Content-Type', 'application/json');
  const token = getAccessToken() ?? headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response = await fetch(url, { ...init, headers });
  if (response.status !== 401 || !retryOnUnauthorized) return response;

  const refreshedToken = await refreshAccessToken();
  if (!refreshedToken) return response;
  headers.set('Authorization', `Bearer ${refreshedToken}`);
  response = await fetch(url, { ...init, headers });
  return response;
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetchWithAuth(`${getApiRoot()}${path}`, init, !path.startsWith('/auth/'));
  if (!response.ok) throw new Error(`请求失败（${response.status}）`);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function authRequest<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${getApiRoot()}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`请求失败（${response.status}）`);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
