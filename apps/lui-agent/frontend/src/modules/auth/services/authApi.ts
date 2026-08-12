import type { AuthResponse } from '@/modules/auth/types';
import { authRequest } from '@/shared/http/client';

export const login = (email: string, password: string) =>
  authRequest<AuthResponse>('/auth/token', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

export const register = (email: string, password: string) =>
  authRequest<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

export const logout = (refreshToken: string) =>
  authRequest<void>('/auth/logout', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
