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
import { enabledCount, parseRemoteServers } from '@/modules/mcp/domain/config';

export type DetailTab = 'overview' | 'tools' | 'credentials';
export type EditorMode = 'form' | 'json';

export interface ServerForm {
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

export function useMcpSettings(enabled = true) {
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
    if (!enabled) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [enabled, load]);

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
      setJsonConfig('');
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
      setJsonConfig('');
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
      setJsonConfig('');
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
      setJsonConfig('');
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
      setJsonConfig('');
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
      if (form.transport === 'SSE')
        throw new Error('SSE 传输暂未接入当前 MCP Host，请使用 Streamable HTTP');
      let args: string[] = [];
      let env: Record<string, string> = {};
      if (form.transport === 'STDIO') {
        if (!form.command.trim()) throw new Error('stdio 必须选择管理员预装命令');
        args = form.args.trim() ? (JSON.parse(form.args) as string[]) : [];
        env = form.env.trim() ? (JSON.parse(form.env) as Record<string, string>) : {};
      }
      const created = await createMcpServer({
        name: form.name,
        ...(form.transport !== 'STDIO' ? { endpoint: form.endpoint } : {}),
        scope: form.transport === 'STDIO' ? 'SHARED' : 'PRIVATE',
        transport: form.transport === 'STDIO' ? 'STDIO' : 'STREAMABLE_HTTP',
        ...(form.transport === 'STDIO' ? { command: form.command, args, env } : {}),
        ...(form.headers.trim()
          ? { headers: JSON.parse(form.headers) as Record<string, string> }
          : {}),
        ...(form.bearerToken ? { bearer_token: form.bearerToken } : {}),
      });
      await load();
      setJsonConfig('');
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
      const configuredNames = new Set(configs.map((config) => config.name));
      for (const config of configs) {
        if (config.transport === 'STDIO') {
          const existing = servers.find((server) => server.name === config.name);
          const saved = existing
            ? await updateMcpServer(existing.id, {
                transport: 'STDIO',
                command: config.command,
                args: config.args,
                env: config.env,
              })
            : await createMcpServer({
                name: config.name,
                scope: 'SHARED',
                transport: 'STDIO',
                command: config.command,
                args: config.args,
                env: config.env,
              });
          if (saved.enabled !== config.enabled) await setServerEnabled(saved.id, config.enabled);
          const currentTools = await listMcpTools(saved.id);
          await Promise.all(
            currentTools
              .filter((tool) => tool.enabled !== (config.tools?.[tool.remote_name] === true))
              .map((tool) => setToolEnabled(tool.id, config.tools?.[tool.remote_name] === true)),
          );
          continue;
        }
        const existing = servers.find((server) => server.name === config.name);
        const saved = existing
          ? await updateMcpServer(existing.id, {
              name: config.name,
              transport: config.transport,
              endpoint: config.endpoint,
              // JSON 是全量配置：未声明 headers 时清空旧凭据，避免公开 MCP 继续携带旧 Authorization。
              headers: config.headers,
              ...(config.bearerToken ? { bearer_token: config.bearerToken } : {}),
            })
          : await createMcpServer({
              name: config.name,
              endpoint: config.endpoint,
              scope: 'PRIVATE',
              transport: config.transport,
              headers: config.headers,
              ...(config.bearerToken ? { bearer_token: config.bearerToken } : {}),
            });
        if (saved.enabled !== config.enabled) await setServerEnabled(saved.id, config.enabled);
        const currentTools = await listMcpTools(saved.id);
        await Promise.all(
          currentTools
            .filter((tool) => tool.enabled !== (config.tools?.[tool.remote_name] === true))
            .map((tool) => setToolEnabled(tool.id, config.tools?.[tool.remote_name] === true)),
        );
      }
      // JSON 是当前用户可见 MCP 的声明式全量配置：未出现在 JSON 中的 Server 删除。
      await Promise.all(
        servers
          .filter((server) => !configuredNames.has(server.name))
          .map((server) => deleteMcpServer(server.id)),
      );
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
      setJsonConfig('');
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
