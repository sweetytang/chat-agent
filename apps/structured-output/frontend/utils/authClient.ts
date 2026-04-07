import { SERVER_URL } from '@common/constants';
import type { AuthSessionSnapshot, AuthResponse } from '@common/types/auth';

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

export async function requestAuth(pathname: string, payload?: Record<string, unknown>) {
    try {
        const requestInit: RequestInit = {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...getAuthHeaders(),
            },
        };

        if (payload) {
            requestInit.body = JSON.stringify(payload);
        }

        const response = await fetch(`${SERVER_URL}${pathname}`, requestInit);
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data?.message || data?.error || "Authentication request failed");
        }

        return data as AuthResponse | { success: true };
    } catch (error: any) {
        if (error instanceof TypeError) {
            throw new Error("Cannot reach the backend service. Please make sure the server is running.");
        }

        throw error;
    }
}