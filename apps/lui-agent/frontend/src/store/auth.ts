import { create } from "zustand";
import { api } from "@/services/api";

interface AuthState {
  token: string | null;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem("lui-agent.access-token"), error: null,
  login: async (email, password) => {
    try {
      const result = await api.login(email, password);
      localStorage.setItem("lui-agent.access-token", result.access_token);
      if (result.refresh_token) localStorage.setItem("lui-agent.refresh-token", result.refresh_token);
      set({ token: result.access_token, error: null });
    } catch (error) { set({ error: error instanceof Error ? error.message : "登录失败" }); }
  },
  logout: () => { localStorage.removeItem("lui-agent.access-token"); set({ token: null }); },
}));
