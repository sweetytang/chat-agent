import type { AuthResponse } from '@/modules/auth/types';
import { authRequest, request } from '@/shared/http/client';

export const login = (email: string, password: string) =>
  authRequest<AuthResponse>('/auth/token', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

export const register = (email: string, password: string, name?: string) =>
  authRequest<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, name }),
  });

export const logout = (refreshToken: string) =>
  authRequest<void>('/auth/logout', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

export const getMe = () =>
  request<{ user_id: string; email: string; name: string | null; role: string }>('/auth/me');

export const updateMe = (name: string | null) =>
  request<{ user_id: string; email: string; name: string | null; role: string }>('/auth/me', {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
