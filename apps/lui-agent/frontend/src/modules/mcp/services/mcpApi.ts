import { request } from '@/shared/http/client';

import type { McpServer } from '../types';

export function listMcpServers() {
  return request<McpServer[]>('/mcp/servers');
}
