import { request } from '@/shared/http/client';

import type { McpServer } from '../types';

export function listMcpServers() {
  return request<McpServer[]>('/mcp/servers');
}

export function listMcpTools(serverId: string) {
  return request<NonNullable<McpServer['tools']>>(`/mcp/servers/${serverId}/tools`);
}

export function setServerEnabled(serverId: string, enabled: boolean) {
  return request<{ enabled: boolean }>(`/mcp/servers/${serverId}/enabled`, {
    method: 'POST',
    body: JSON.stringify({ enabled }),
  });
}

export function setToolEnabled(toolId: string, enabled: boolean) {
  return request<{ enabled: boolean }>(`/mcp/tools/${toolId}/enabled`, {
    method: 'POST',
    body: JSON.stringify({ enabled }),
  });
}

export function createMcpServer(payload: {
  name: string;
  scope: 'PRIVATE';
  transport: 'STREAMABLE_HTTP';
  endpoint: string;
  bearer_token?: string;
}) {
  return request<McpServer>('/mcp/servers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Refresh is intentionally a separate action so a failed discovery can be retried. */
export function refreshMcpServer(serverId: string) {
  return request<McpServer>(`/mcp/servers/${serverId}/refresh`, { method: 'POST' });
}
