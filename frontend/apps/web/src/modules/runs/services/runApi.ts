import { getApiRoot, request } from '@/shared/http/client';

export const getRunStreamUrl = () => {
  if (typeof window !== 'undefined') {
    if (window.__OPEN_AGENT_CONFIG__?.streamUrl) {
      return window.__OPEN_AGENT_CONFIG__.streamUrl;
    }
    if (window.__LUI_CONFIG__?.streamUrl) {
      return window.__LUI_CONFIG__.streamUrl;
    }
  }
  return (
    import.meta.env.OPEN_AGENT_API_URL ??
    import.meta.env.VITE_API_URL ??
    `${getApiRoot()}/runs/stream`
  );
};

export const RUN_STREAM_URL = getRunStreamUrl();

export const cancelRun = (runId: string) =>
  request<{ run_id: string; status: string }>(`/runs/${runId}/cancel`, { method: 'POST' });
