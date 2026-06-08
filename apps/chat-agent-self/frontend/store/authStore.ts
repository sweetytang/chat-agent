import { create } from "zustand";
import { resetChatStore } from "./chatStore";
import { resetStreamStore } from "./streamStore";
import { resetThreadStore } from "./threadStore";
import { getAuthHeaders, loadStoredAuthSession, requestAuth, saveStoredAuthSession } from "../utils/authClient";
import { SERVER_URL } from "@common/constants";
import type { IUser } from "@common/types";
import { AuthMode, AuthResponse, AuthStatus, AuthState } from "@common/types/auth";


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

export const useAuthStore = create<AuthState>((set, get) => {
    const {
        user: currentUser = null,
        token = null,
    } = loadStoredAuthSession() || {};

    return {
        currentUser,
        token,
        status: token ? AuthStatus.LOADING : AuthStatus.ANONYMOUS,
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
                    // 服务器明确拒绝（401/403）→ session 真的过期了，清除存储
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
            } catch (error) {
                if (error instanceof TypeError) {
                    // 网络错误（后端不可达）→ 保留 localStorage，用缓存的用户信息恢复登录态
                    // 这样重启后端后刷新页面即可恢复
                    console.warn("[Auth] Backend unreachable, using cached session");
                    set({
                        currentUser: snapshot.user,
                        token: snapshot.token,
                        status: AuthStatus.AUTHENTICATED,
                        error: null,
                    });
                    return;
                }

                // 真正的认证失败 → 清除存储
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
            const token = get().token;

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
    }
});
