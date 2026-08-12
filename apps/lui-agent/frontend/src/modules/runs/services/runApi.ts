import { API_ROOT, request } from '@/shared/http/client';

export const RUN_STREAM_URL = import.meta.env.VITE_API_URL ?? `${API_ROOT}/runs/stream`;

export const cancelRun = (runId: string) =>
  request<{ run_id: string; status: string }>(`/runs/${runId}/cancel`, { method: 'POST' });
