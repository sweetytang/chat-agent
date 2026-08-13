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
  scope: 'PRIVATE' | 'SHARED';
  transport: 'STREAMABLE_HTTP' | 'STDIO';
  endpoint?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  bearer_token?: string;
  headers?: Record<string, string>;
}) {
  return request<McpServer>('/mcp/servers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateMcpServer(
  serverId: string,
  payload: {
    name?: string;
    endpoint?: string;
    bearer_token?: string;
    headers?: Record<string, string>;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
  },
) {
  return request<McpServer>(`/mcp/servers/${serverId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteMcpServer(serverId: string) {
  return request<void>(`/mcp/servers/${serverId}`, { method: 'DELETE' });
}

/** Refresh is intentionally a separate action so a failed discovery can be retried. */
export function refreshMcpServer(serverId: string) {
  return request<McpServer>(`/mcp/servers/${serverId}/refresh`, { method: 'POST' });
}
