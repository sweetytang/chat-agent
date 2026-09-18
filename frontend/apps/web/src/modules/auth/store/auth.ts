import { create } from 'zustand';

import { getMe, login, logout, register, updateMe } from '@/modules/auth/services/authApi';
import { abortAllStreams } from '@/modules/runs/domain/activeStream';
import { useRunStore } from '@/modules/runs/store/run';
import {
  clearAuthSession,
  getAccessToken,
  getRefreshToken,
  saveAuthSession,
  subscribeAuthSession,
} from '@/shared/session/authSession';

interface AuthState {
  token: string | null;
  email: string | null;
  name: string | null;
  role: string | null;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, name?: string) => Promise<boolean>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
  updateName: (name: string | null) => Promise<boolean>;
}

function clearActiveRuns(): void {
  abortAllStreams();
  useRunStore.getState().resetAll();
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: getAccessToken(),
  email: null,
  name: null,
  role: null,
  error: null,
  fetchMe: async () => {
    if (!get().token) return;
    try {
      const me = await getMe();
      set({ email: me.email, name: me.name, role: me.role });
    } catch {
      /* 忽略静默失败 */
    }
  },
  updateName: async (name: string | null) => {
    try {
      const res = await updateMe(name);
      set({ name: res.name });
      return true;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '修改姓名失败' });
      return false;
    }
  },
  login: async (email, password) => {
    try {
      const result = await login(email, password);
      saveAuthSession(result.access_token, result.refresh_token);
      set({ error: null });
      await get().fetchMe();
      return true;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '登录失败' });
      return false;
    }
  },
  register: async (email, password, name) => {
    try {
      const result = await register(email, password, name);
      saveAuthSession(result.access_token, result.refresh_token);
      set({ error: null });
      await get().fetchMe();
      return true;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '注册失败' });
      return false;
    }
  },
  logout: async () => {
    const refreshToken = getRefreshToken();
    clearAuthSession();
    set({ email: null, name: null, role: null, error: null });
    if (refreshToken) {
      try {
        await logout(refreshToken);
      } catch {
        /* 本地会话已清除，服务端撤销失败不阻塞退出。 */
      }
    }
  },
}));

subscribeAuthSession((token) => {
  if (!token) clearActiveRuns();
  useAuthStore.setState({ token, ...(!token ? { email: null, name: null, role: null } : {}) });
  if (token) void useAuthStore.getState().fetchMe();
});
if (typeof window !== 'undefined') {
  if (getAccessToken()) void useAuthStore.getState().fetchMe();
  window.addEventListener('lui-agent:auth-expired', () => {
    clearActiveRuns();
    useAuthStore.setState({ token: null, name: null, role: null, error: '登录已过期，请重新登录' });
  });
}
