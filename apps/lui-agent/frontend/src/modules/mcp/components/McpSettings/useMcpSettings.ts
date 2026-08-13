import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';

import {
  createMcpServer,
  deleteMcpServer,
  listMcpServers,
  listMcpTools,
  refreshMcpServer,
  setServerEnabled,
  setToolEnabled,
  updateMcpServer,
} from '@/modules/mcp/services/mcpApi';
import type { McpServer, McpTool } from '@/modules/mcp/types';

export type DetailTab = 'overview' | 'tools' | 'credentials';
export type EditorMode = 'form' | 'json';

interface ServerForm {
  name: string;
  endpoint: string;
  bearerToken: string;
  transport: 'STREAMABLE_HTTP' | 'SSE' | 'STDIO';
  headers: string;
  command: string;
  args: string;
  env: string;
}

const EMPTY_FORM: ServerForm = {
  name: '',
  endpoint: '',
  bearerToken: '',
  transport: 'STREAMABLE_HTTP',
  headers: '',
  command: '',
  args: '',
  env: '',
};

export function statusMeta(server: McpServer) {
  if (!server.enabled || server.status === 'DISABLED')
    return { label: '已禁用', tone: 'disabled' } as const;
  if (server.status === 'CONNECTED') return { label: '已连接', tone: 'connected' } as const;
  if (server.status === 'CONNECTING') return { label: '连接中', tone: 'connecting' } as const;
  return { label: server.last_error ?? '连接异常', tone: 'error' } as const;
}

export function enabledCount(server: McpServer) {
  return (server.tools ?? []).filter((tool) => tool.enabled).length;
}

/** 将后端返回的完整 Server/Tool 目录投影为可读的 MCP 配置快照。凭据只显示脱敏标记。 */
export function serializeMcpServers(servers: McpServer[]) {
  return JSON.stringify(
    {
      mcpServers: Object.fromEntries(
        servers.map((server) => [
          server.name,
          {
            ...(server.endpoint ? { url: server.endpoint } : {}),
            type: server.transport === 'STDIO' ? 'stdio' : 'http',
            scope: server.scope,
            enabled: server.enabled,
            ...(server.credential_configured
              ? { headers: { Authorization: 'Bearer <configured>' } }
              : {}),
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

export interface ParsedMcpServerConfig {
  name: string;
  endpoint: string;
  transport: 'STREAMABLE_HTTP';
  headers: Record<string, string>;
  bearerToken: string;
  enabled?: boolean;
  tools?: Record<string, unknown>;
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
    const transport = config.transport;
    const type = config.type;
    if (typeof config.command === 'string' || type === 'stdio')
      throw new Error(`${name} 是 stdio 配置；当前部署尚未启用受控安装服务`);
    const remoteType = type ?? transport;
    if (
      remoteType &&
      remoteType !== 'http' &&
      remoteType !== 'streamable-http' &&
      remoteType !== 'STREAMABLE_HTTP'
    )
      throw new Error(`${name} 使用了当前 V1 不支持的 type：${JSON.stringify(remoteType)}`);
    const unsupported = ['timeout'].filter((key) => key in config);
    if (unsupported.length)
      throw new Error(
        `${name} 包含当前 V1 不支持的字段：${unsupported.join(', ')}`,
      );
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
        .filter(([, value]) => typeof value === 'string'),
    ) as Record<string, string>;
    const enabled = typeof config.enabled === 'boolean' ? config.enabled : undefined;
    const tools =
      typeof config.tools === 'object' && config.tools !== null
        ? (config.tools as Record<string, unknown>)
        : undefined;
    return {
      name,
      endpoint,
      transport: 'STREAMABLE_HTTP' as const,
      headers: normalizedHeaders,
      enabled,
      tools,
      bearerToken:
        typeof authorization === 'string' && authorization.startsWith('Bearer ')
          ? authorization.slice(7).replace('<configured>', '')
          : '',
    };
  });
}

export function useMcpSettings() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [editorMode, setEditorMode] = useState<EditorMode>('form');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<ServerForm>(EMPTY_FORM);
  const [jsonConfig, setJsonConfig] = useState('');
  const [toolQuery, setToolQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const jsonValidation = useMemo(() => {
    if (!jsonConfig.trim())
      return { valid: false, label: '等待输入', detail: '粘贴包含 mcpServers 的 JSON 配置' };
    try {
      parseRemoteServers(jsonConfig);
      return { valid: true, label: 'JSON 有效', detail: '可导入远程 HTTP MCP 配置' };
    } catch (cause) {
      return {
        valid: false,
        label: 'JSON 无效',
        detail: cause instanceof Error ? cause.message : '配置格式错误',
      };
    }
  }, [jsonConfig]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await listMcpServers();
      const hydrated = await Promise.all(
        items.map(async (server) => {
          try {
            return { ...server, tools: await listMcpTools(server.id) };
          } catch {
            return server;
          }
        }),
      );
      setServers(hydrated);
      setSelectedId((current) =>
        current && hydrated.some((server) => server.id === current)
          ? current
          : (hydrated[0]?.id ?? null),
      );
    } catch {
      setError('MCP 配置加载失败，请重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selected = servers.find((server) => server.id === selectedId) ?? null;
  const filteredServers = useMemo(
    () => servers.filter((server) => server.name.toLowerCase().includes(query.toLowerCase())),
    [query, servers],
  );
  const filteredTools = useMemo(
    () =>
      (selected?.tools ?? []).filter((tool) =>
        `${tool.remote_name} ${tool.description ?? ''}`
          .toLowerCase()
          .includes(toolQuery.toLowerCase()),
      ),
    [selected, toolQuery],
  );
  const exposedTools = servers.reduce((total, server) => total + enabledCount(server), 0);

  function selectServer(server: McpServer) {
    setSelectedId(server.id);
    setShowAdd(false);
    setDetailTab('overview');
    setNotice(null);
  }

  function startAdd() {
    setShowAdd(true);
    setSelectedId(null);
    setForm(EMPTY_FORM);
    setJsonConfig('');
    setEditorMode('form');
    setError(null);
  }

  async function toggleServer(server: McpServer) {
    setBusy(true);
    setError(null);
    try {
      await setServerEnabled(server.id, !server.enabled);
      await load();
    } catch {
      setError('Server 状态保存失败');
    } finally {
      setBusy(false);
    }
  }

  async function toggleTool(tool: McpTool) {
    setError(null);
    try {
      await setToolEnabled(tool.id, !tool.enabled);
      await load();
    } catch {
      setError('工具状态保存失败');
    }
  }

  async function setAllTools(enabled: boolean) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const candidates = (selected.tools ?? []).filter(
        (tool) =>
          tool.enabled !== enabled && tool.is_present && tool.compatibility !== 'INCOMPATIBLE',
      );
      await Promise.all(candidates.map((tool) => setToolEnabled(tool.id, enabled)));
      await load();
    } catch {
      setError('批量更新工具失败');
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await refreshMcpServer(selected.id);
      await load();
      setNotice('连接成功，工具目录已刷新');
    } catch {
      setError('连接测试失败，请检查地址、凭据或 Server 日志');
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await updateMcpServer(selected.id, {
        name: form.name.trim() ? form.name : selected.name,
        endpoint: form.endpoint.trim() ? form.endpoint : (selected.endpoint ?? undefined),
        ...(form.bearerToken ? { bearer_token: form.bearerToken } : {}),
      });
      setForm(EMPTY_FORM);
      await load();
      setNotice('配置已保存；留空的凭据保持不变');
    } catch {
      setError('保存失败，请检查配置');
    } finally {
      setBusy(false);
    }
  }

  async function createServer(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (form.transport === 'STDIO')
        throw new Error('stdio 仅支持管理员受控安装，不能从此处直接执行本地命令');
      if (form.transport === 'SSE')
        throw new Error('SSE 传输暂未接入当前 MCP Host，请使用 Streamable HTTP');
      const created = await createMcpServer({
        name: form.name,
        endpoint: form.endpoint,
        scope: 'PRIVATE',
        transport: 'STREAMABLE_HTTP',
        ...(form.headers.trim()
          ? { headers: JSON.parse(form.headers) as Record<string, string> }
          : {}),
        ...(form.bearerToken ? { bearer_token: form.bearerToken } : {}),
      });
      await load();
      setShowAdd(false);
      setSelectedId(created.id);
      setForm(EMPTY_FORM);
    } catch {
      setError('Server 创建失败，请检查地址和凭据');
    } finally {
      setBusy(false);
    }
  }

  async function importJson() {
    setBusy(true);
    setError(null);
    try {
      const configs = parseRemoteServers(jsonConfig);
      for (const config of configs) {
        const existing = servers.find((server) => server.name === config.name);
        const saved = existing
          ? await updateMcpServer(existing.id, {
              name: config.name,
              endpoint: config.endpoint,
              ...(Object.keys(config.headers).length ? { headers: config.headers } : {}),
              ...(config.bearerToken ? { bearer_token: config.bearerToken } : {}),
            })
          : await createMcpServer({
              name: config.name,
              endpoint: config.endpoint,
              scope: 'PRIVATE',
              transport: config.transport,
              ...(Object.keys(config.headers).length ? { headers: config.headers } : {}),
              ...(config.bearerToken ? { bearer_token: config.bearerToken } : {}),
            });
        if (typeof config.enabled === 'boolean' && saved.enabled !== config.enabled)
          await setServerEnabled(saved.id, config.enabled);
        if (config.tools) {
          const currentTools = await listMcpTools(saved.id);
          await Promise.all(
            currentTools
              .filter(
                (tool) =>
                  typeof config.tools?.[tool.remote_name] === 'boolean' &&
                  config.tools[tool.remote_name] !== tool.enabled,
              )
              .map((tool) => setToolEnabled(tool.id, config.tools?.[tool.remote_name] as boolean)),
          );
        }
      }
      await load();
      setShowAdd(false);
      setJsonConfig('');
    } catch (cause) {
      setError(cause instanceof Error ? `JSON 导入失败：${cause.message}` : 'JSON 导入失败');
    } finally {
      setBusy(false);
    }
  }

  async function removeSelected() {
    if (!selected || !window.confirm(`确定删除 ${selected.name}？此操作会断开连接。`)) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await deleteMcpServer(selected.id);
      await load();
    } catch {
      setError('删除失败，请重试');
    } finally {
      setBusy(false);
    }
  }

  return {
    servers,
    selectedId,
    query,
    setQuery,
    detailTab,
    setDetailTab,
    editorMode,
    setEditorMode,
    showAdd,
    setShowAdd,
    form,
    setForm,
    jsonConfig,
    setJsonConfig,
    jsonValidation,
    toolQuery,
    setToolQuery,
    loading,
    busy,
    error,
    setError,
    notice,
    setNotice,
    selected,
    filteredServers,
    filteredTools,
    exposedTools,
    selectServer,
    startAdd,
    toggleServer,
    toggleTool,
    setAllTools,
    testConnection,
    saveSettings,
    createServer,
    importJson,
    removeSelected,
  };
}
