import type { ThreadHistory } from '@/modules/threads/types/history';
import type { ThreadSummary } from '@/modules/threads/types/thread';
import { request } from '@/shared/http/client';

export const listThreads = () => request<ThreadSummary[]>('/threads');

export const createThread = (title?: string) =>
  request<ThreadSummary>('/threads', { method: 'POST', body: JSON.stringify({ title }) });

export const getThreadHistory = (threadId: string) =>
  request<ThreadHistory>(`/threads/${threadId}/history`);

export const updateThread = (threadId: string, update: { title?: string; is_pinned?: boolean }) =>
  request<ThreadSummary>(`/threads/${threadId}`, {
    method: 'PATCH',
    body: JSON.stringify(update),
  });

export const deleteThread = (threadId: string) =>
  request<void>(`/threads/${threadId}`, { method: 'DELETE' });
