import type { McpServer } from '@/modules/mcp/types';

/** 将后端返回的 user_mcp_servers 列表格式化为标准的、纯粹的 mcpServers JSON 格式（不注入多余的内部 tools/规则） */
export function serializeMcpServers(servers: McpServer[]): string {
  return JSON.stringify(
    {
      mcpServers: Object.fromEntries(
        servers.map((server) => {
          if (server.transport === 'stdio') {
            const entry: Record<string, unknown> = {
              command: server.command ?? '',
              args: server.args ?? [],
            };
            if (server.process_env && Object.keys(server.process_env).length > 0) {
              entry.env = server.process_env;
            }
            return [server.name, entry];
          }
          const entry: Record<string, unknown> = {
            url: server.endpoint ?? '',
          };
          if (server.transport && server.transport !== 'streamable_http') {
            entry.transport = server.transport;
          }
          if (server.request_headers && Object.keys(server.request_headers).length > 0) {
            entry.headers = server.request_headers;
          }
          return [server.name, entry];
        }),
      ),
    },
    null,
    2,
  );
}

/** 校验并解析输入的 mcpServers JSON */
export function parseMcpServersJson(source: string): Record<string, unknown> {
  const parsed = JSON.parse(source);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('配置必须是 JSON 对象');
  }
  const root = parsed as { mcpServers?: unknown };
  if (typeof root.mcpServers !== 'object' || root.mcpServers === null) {
    throw new Error('缺少 mcpServers 根对象');
  }
  return root.mcpServers as Record<string, unknown>;
}
