import { request } from '@/shared/http/client';

import type { McpServer, LiveMcpTool } from '../types';

export function listMcpServers() {
  return request<McpServer[]>('/mcp/servers');
}

export function listServerLiveTools(serverId: string) {
  return request<LiveMcpTool[]>(`/mcp/servers/${serverId}/tools`);
}

export function syncMcpConfig(mcpServers: Record<string, unknown>) {
  return request<McpServer[]>('/mcp/config', {
    method: 'PUT',
    body: JSON.stringify({ mcpServers }),
  });
}

export function updateMcpServer(serverId: string, payload: Partial<McpServer>) {
  return request<McpServer>(`/mcp/servers/${serverId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteMcpServer(serverId: string) {
  return request<void>(`/mcp/servers/${serverId}`, { method: 'DELETE' });
}
