export const ACCESS_TOKEN_KEY = 'lui-agent.access-token';
export const REFRESH_TOKEN_KEY = 'lui-agent.refresh-token';
export const AUTH_EMAIL_KEY = 'lui-agent.auth-email';

type SessionListener = (accessToken: string | null) => void;

const listeners = new Set<SessionListener>();

function storage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

export function getAccessToken(): string | null {
  return storage()?.getItem(ACCESS_TOKEN_KEY) ?? null;
}

export function getRefreshToken(): string | null {
  return storage()?.getItem(REFRESH_TOKEN_KEY) ?? null;
}

export function getAuthEmail(): string | null {
  return storage()?.getItem(AUTH_EMAIL_KEY) ?? null;
}

export function saveAuthSession(
  accessToken: string,
  refreshToken: string | null,
  email?: string | null,
): void {
  storage()?.setItem(ACCESS_TOKEN_KEY, accessToken);
  if (refreshToken) storage()?.setItem(REFRESH_TOKEN_KEY, refreshToken);
  else storage()?.removeItem(REFRESH_TOKEN_KEY);
  if (email) storage()?.setItem(AUTH_EMAIL_KEY, email);
  listeners.forEach((listener) => listener(accessToken));
}

export function clearAuthSession(): void {
  storage()?.removeItem(ACCESS_TOKEN_KEY);
  storage()?.removeItem(REFRESH_TOKEN_KEY);
  storage()?.removeItem(AUTH_EMAIL_KEY);
  listeners.forEach((listener) => listener(null));
}

export function notifyAuthExpired(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('lui-agent:auth-expired'));
}

export function subscribeAuthSession(listener: SessionListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
