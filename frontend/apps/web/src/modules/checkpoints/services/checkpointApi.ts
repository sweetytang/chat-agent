import type { CheckpointSummary } from '@/modules/checkpoints/types';
import { request } from '@/shared/http/client';

export const listCheckpoints = (threadId: string) =>
  request<CheckpointSummary[]>(`/threads/${threadId}/checkpoints`);

export const switchCheckpoint = (threadId: string, checkpointId: string) =>
  request<unknown>(`/threads/${threadId}/checkpoints/${checkpointId}/switch`, { method: 'POST' });
