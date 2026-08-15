import type { McpServer } from '@/modules/mcp/types';

export interface ParsedMcpServerConfig {
  name: string;
  endpoint?: string;
  transport: 'STREAMABLE_HTTP' | 'STDIO';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  headers: Record<string, string>;
  bearerToken: string;
  enabled: boolean;
  tools: Record<string, unknown>;
}

export function enabledCount(server: McpServer) {
  return (server.tools ?? []).filter((tool) => tool.enabled).length;
}

export function statusMeta(server: McpServer) {
  if (!server.enabled || server.status === 'DISABLED')
    return { label: '已禁用', tone: 'disabled' } as const;
  if (server.status === 'CONNECTED') return { label: '已连接', tone: 'connected' } as const;
  if (server.status === 'CONNECTING') return { label: '连接中', tone: 'connecting' } as const;
  return { label: server.last_error ?? '连接异常', tone: 'error' } as const;
}

/** 将后端返回的完整 Server/Tool 目录投影为可读的 MCP 配置快照。凭据只显示脱敏标记。 */
export function serializeMcpServers(servers: McpServer[]) {
  return JSON.stringify(
    {
      mcpServers: Object.fromEntries(
        servers.map((server) => [
          server.name,
          {
            ...(server.transport === 'STDIO'
              ? {
                  type: 'stdio',
                  command: server.command ?? '',
                  args: server.args ?? [],
                  env: server.env ?? {},
                }
              : { type: 'http', url: server.endpoint ?? '' }),
            scope: server.scope,
            enabled: server.enabled,
            headers:
              server.transport === 'STDIO'
                ? {}
                : server.credential_configured
                  ? { Authorization: 'Bearer <configured>' }
                  : {},
            tools: Object.fromEntries(
              (server.tools ?? []).map((tool) => [tool.remote_name, tool.enabled]),
            ),
          },
        ]),
      ),
    },
    null,
    2,
  );
}

export function parseRemoteServers(source: string): ParsedMcpServerConfig[] {
  const value: unknown = JSON.parse(source);
  if (typeof value !== 'object' || value === null) throw new Error('配置必须是 JSON 对象');
  const root = value as { mcpServers?: unknown };
  if (typeof root.mcpServers !== 'object' || root.mcpServers === null)
    throw new Error('缺少 mcpServers 对象');

  return Object.entries(root.mcpServers as Record<string, unknown>).map(([name, item]) => {
    if (typeof item !== 'object' || item === null) throw new Error(`${name} 配置无效`);
    const config = item as Record<string, unknown>;
    const type = config.type;
    const isStdio = type === 'stdio' || typeof config.command === 'string';
    if (isStdio) {
      if (typeof config.command !== 'string' || !config.command.trim())
        throw new Error(`${name} 的 stdio command 不能为空`);
      const args =
        Array.isArray(config.args) && config.args.every((entry) => typeof entry === 'string')
          ? config.args
          : [];
      const env =
        typeof config.env === 'object' && config.env !== null
          ? (Object.fromEntries(
              Object.entries(config.env)
                .filter(([, entry]) => typeof entry === 'string')
                .map(([key, entry]) => [key, String(entry).trim()]),
            ) as Record<string, string>)
          : {};
      return {
        name,
        transport: 'STDIO',
        command: config.command,
        args,
        env,
        headers: {},
        bearerToken: '',
        enabled: typeof config.enabled === 'boolean' ? config.enabled : false,
        tools:
          typeof config.tools === 'object' && config.tools !== null
            ? (config.tools as Record<string, unknown>)
            : {},
      };
    }
    const remoteType = type ?? config.transport;
    if (
      remoteType &&
      remoteType !== 'http' &&
      remoteType !== 'streamable-http' &&
      remoteType !== 'STREAMABLE_HTTP'
    )
      throw new Error(`${name} 使用了当前 V1 不支持的 type：${JSON.stringify(remoteType)}`);
    const unsupported = ['timeout'].filter((key) => key in config);
    if (unsupported.length)
      throw new Error(`${name} 包含当前 V1 不支持的字段：${unsupported.join(', ')}`);
    const endpoint =
      typeof config.url === 'string'
        ? config.url
        : typeof config.endpoint === 'string'
          ? config.endpoint
          : '';
    if (!endpoint) throw new Error(`${name} 缺少 url 或 endpoint`);
    const headers =
      typeof config.headers === 'object' && config.headers !== null
        ? (config.headers as Record<string, unknown>)
        : {};
    const authorization = headers.Authorization ?? headers.authorization;
    const normalizedHeaders = Object.fromEntries(
      Object.entries(headers)
        .filter(([key]) => key.toLowerCase() !== 'authorization')
        .filter(([, entry]) => typeof entry === 'string'),
    ) as Record<string, string>;
    return {
      name,
      endpoint,
      transport: 'STREAMABLE_HTTP' as const,
      headers: normalizedHeaders,
      enabled: typeof config.enabled === 'boolean' ? config.enabled : false,
      tools:
        typeof config.tools === 'object' && config.tools !== null
          ? (config.tools as Record<string, unknown>)
          : {},
      bearerToken:
        typeof authorization === 'string' && authorization.startsWith('Bearer ')
          ? authorization.slice(7).replace('<configured>', '')
          : '',
    };
  });
}
