import { create } from "zustand";
import { login, logout, register } from "@/modules/auth/services/authApi";
import { clearAuthSession, getAccessToken, getRefreshToken, saveAuthSession, subscribeAuthSession } from "@/shared/session/authSession";

interface AuthState {
  token: string | null;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: getAccessToken(), error: null,
  login: async (email, password) => {
    try {
      const result = await login(email, password);
      saveAuthSession(result.access_token, result.refresh_token);
      set({ error: null });
    } catch (error) { set({ error: error instanceof Error ? error.message : "登录失败" }); }
  },
  register: async (email, password) => {
    try {
      const result = await register(email, password);
      saveAuthSession(result.access_token, result.refresh_token);
      set({ error: null });
    } catch (error) { set({ error: error instanceof Error ? error.message : "注册失败" }); }
  },
  logout: async () => {
    const refreshToken = getRefreshToken();
    clearAuthSession();
    if (refreshToken) {
      try { await logout(refreshToken); } catch { /* 本地会话已清除，服务端撤销失败不阻塞退出。 */ }
    }
  },
}));

subscribeAuthSession((token) => useAuthStore.setState({ token }));
if (typeof window !== "undefined") {
  window.addEventListener("lui-agent:auth-expired", () => {
    useAuthStore.setState({ token: null, error: "登录已过期，请重新登录" });
  });
}
