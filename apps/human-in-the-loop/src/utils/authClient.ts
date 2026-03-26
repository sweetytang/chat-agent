import type { AuthSessionSnapshot } from '../types/auth';

const AUTH_STORAGE_KEY = "hitl-auth-session";

export function loadStoredAuthSession(): AuthSessionSnapshot | null {
    if (typeof window === "undefined") {
        return null;
    }

    try {
        const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
        return raw ? JSON.parse(raw) as AuthSessionSnapshot : null;
    } catch {
        return null;
    }
}

export function saveStoredAuthSession(snapshot: AuthSessionSnapshot | null) {
    if (typeof window === "undefined") {
        return;
    }

    if (!snapshot) {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
        return;
    }

    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(snapshot));
}

export function getAuthHeaders(token?: string | null): HeadersInit {
    const session = token ? null : loadStoredAuthSession();
    const resolvedToken = token ?? session?.token ?? null;
    return resolvedToken ? { Authorization: `Bearer ${resolvedToken}` } : {};
}
