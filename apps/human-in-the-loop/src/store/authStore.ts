import { create } from "zustand";
import { SERVER_URL } from "../constants";
import { getAuthHeaders, loadStoredAuthSession, saveStoredAuthSession } from "../utils/authClient";
import type { IUser } from "../types";
import { AuthMode, AuthResponse, AuthStatus, AuthState } from "../types/auth";
import { resetChatStore } from "./chatStore";
import { resetStreamStore } from "./streamStore";
import { resetThreadStore } from "./threadStore";


async function requestAuth(pathname: string, payload?: Record<string, unknown>) {
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

function applyAuthenticatedState(user: IUser, token: string) {
    saveStoredAuthSession({ user, token });
    resetChatStore();
    resetStreamStore();
    resetThreadStore();
    useAuthStore.setState({
        currentUser: user,
        token,
        status: AuthStatus.AUTHENTICATED,
        error: null,
    });
}

export const useAuthStore = create<AuthState>((set) => ({
    currentUser: loadStoredAuthSession()?.user ?? null,
    token: loadStoredAuthSession()?.token ?? null,
    status: loadStoredAuthSession()?.token ? AuthStatus.LOADING : AuthStatus.ANONYMOUS,
    mode: AuthMode.LOGIN,
    error: null,

    hydrateSession: async () => {
        const snapshot = loadStoredAuthSession();
        if (!snapshot?.token) {
            set({ currentUser: null, token: null, status: AuthStatus.ANONYMOUS, error: null });
            return;
        }

        try {
            const response = await fetch(`${SERVER_URL}/auth/me`, {
                headers: getAuthHeaders(snapshot.token),
            });

            if (!response.ok) {
                throw new Error("Session expired");
            }

            const data = await response.json() as { user: IUser };
            saveStoredAuthSession({ user: data.user, token: snapshot.token });
            set({
                currentUser: data.user,
                token: snapshot.token,
                status: AuthStatus.AUTHENTICATED,
                error: null,
            });
        } catch {
            saveStoredAuthSession(null);
            resetChatStore();
            resetStreamStore();
            resetThreadStore();
            set({
                currentUser: null,
                token: null,
                status: AuthStatus.ANONYMOUS,
                error: null,
            });
        }
    },

    setMode: (mode) => set({ mode, error: null }),

    clearError: () => set({ error: null }),

    login: async (username, password) => {
        set({ status: AuthStatus.LOADING, error: null });
        try {
            const result = await requestAuth("/auth/login", { username, password }) as AuthResponse;
            applyAuthenticatedState(result.user, result.session.token);
            return true;
        } catch (error: any) {
            set({
                status: AuthStatus.ANONYMOUS,
                error: error.message,
            });
            return false;
        }
    },

    register: async (username, password) => {
        set({ status: AuthStatus.LOADING, error: null });
        try {
            const result = await requestAuth("/auth/register", { username, password }) as AuthResponse;
            applyAuthenticatedState(result.user, result.session.token);
            return true;
        } catch (error: any) {
            set({
                status: AuthStatus.ANONYMOUS,
                error: error.message,
            });
            return false;
        }
    },

    logout: async () => {
        const token = useAuthStore.getState().token;

        try {
            if (token) {
                await requestAuth("/auth/logout");
            }
        } catch {
            // Ignore logout request failures; local cleanup should still happen.
        } finally {
            saveStoredAuthSession(null);
            resetChatStore();
            resetStreamStore();
            resetThreadStore();
            set({
                currentUser: null,
                token: null,
                status: AuthStatus.ANONYMOUS,
                error: null,
            });
        }
    },
}));
