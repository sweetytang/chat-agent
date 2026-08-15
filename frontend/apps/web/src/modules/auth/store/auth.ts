import { create } from 'zustand';

import { login, logout, register } from '@/modules/auth/services/authApi';
import {
  clearAuthSession,
  getAuthEmail,
  getAccessToken,
  getRefreshToken,
  saveAuthSession,
  subscribeAuthSession,
} from '@/shared/session/authSession';

interface AuthState {
  token: string | null;
  email: string | null;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: getAccessToken(),
  email: getAuthEmail(),
  error: null,
  login: async (email, password) => {
    try {
      const result = await login(email, password);
      const profileEmail = result.email ?? email;
      saveAuthSession(result.access_token, result.refresh_token, profileEmail);
      set({ email: profileEmail, error: null });
      return true;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '登录失败' });
      return false;
    }
  },
  register: async (email, password) => {
    try {
      const result = await register(email, password);
      const profileEmail = result.email ?? email;
      saveAuthSession(result.access_token, result.refresh_token, profileEmail);
      set({ email: profileEmail, error: null });
      return true;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '注册失败' });
      return false;
    }
  },
  logout: async () => {
    const refreshToken = getRefreshToken();
    clearAuthSession();
    set({ email: null, error: null });
    if (refreshToken) {
      try {
        await logout(refreshToken);
      } catch {
        /* 本地会话已清除，服务端撤销失败不阻塞退出。 */
      }
    }
  },
}));

subscribeAuthSession((token) =>
  useAuthStore.setState({ token, ...(!token ? { email: null } : {}) }),
);
if (typeof window !== 'undefined') {
  window.addEventListener('lui-agent:auth-expired', () => {
    useAuthStore.setState({ token: null, error: '登录已过期，请重新登录' });
  });
}
