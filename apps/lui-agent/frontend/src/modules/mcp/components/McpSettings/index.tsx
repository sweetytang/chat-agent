import { RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { useUiStore } from '@/app/store/ui';
import {
  createMcpServer,
  listMcpServers,
  listMcpTools,
  refreshMcpServer,
  setServerEnabled,
  setToolEnabled,
} from '@/modules/mcp/services/mcpApi';
import type { McpServer } from '@/modules/mcp/types';

import styles from './index.module.css';

export function McpSettings() {
  const close = () => useUiStore.getState().setMcpSettingsOpen(false);
  const [servers, setServers] = useState<McpServer[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', endpoint: '', bearer_token: '' });

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

  async function toggleTool(serverId: string, toolId: string) {
    const server = servers.find((item) => item.id === serverId);
    const tool = server?.tools?.find((item) => item.id === toolId);
    if (!tool) return;
    const enabled = !tool.enabled;
    setServers((items) =>
      items.map((item) =>
        item.id === serverId
          ? {
              ...item,
              tools: item.tools?.map((entry) =>
                entry.id === toolId ? { ...entry, enabled } : entry,
              ),
            }
          : item,
      ),
    );
    try {
      await setToolEnabled(toolId, enabled);
    } catch {
      setError('工具状态保存失败');
      await load();
    }
  }

  async function toggleServer(server: McpServer) {
    const enabled = !server.enabled;
    setServers((items) =>
      items.map((item) => (item.id === server.id ? { ...item, enabled } : item)),
    );
    try {
      await setServerEnabled(server.id, enabled);
    } catch {
      setError('Server 状态保存失败');
      await load();
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await createMcpServer({
        name: form.name,
        endpoint: form.endpoint,
        scope: 'PRIVATE',
        transport: 'STREAMABLE_HTTP',
        ...(form.bearer_token ? { bearer_token: form.bearer_token } : {}),
      });
      setForm({ name: '', endpoint: '', bearer_token: '' });
      await load();
    } catch {
      setError('Server 创建失败，请检查地址');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className={styles.overlay} role="presentation" onClick={close}>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <section
        className={styles.panel}
        aria-label="MCP 配置"
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.titlebar}>
          <div>
            <strong>MCP 插件配置</strong>
            <div className={styles.meta}>管理已接入的 MCP Server 和工具</div>
          </div>
          <button className={styles.close} onClick={close} aria-label="关闭 MCP 配置">
            <X size={18} />
          </button>
        </header>
        <form className={styles.form} onSubmit={(event) => void submit(event)}>
          <input
            required
            placeholder="Server 名称"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
          <input
            required
            type="url"
            placeholder="Streamable HTTP 地址"
            value={form.endpoint}
            onChange={(event) => setForm({ ...form, endpoint: event.target.value })}
          />
          <input
            type="password"
            placeholder="Bearer Token（可选）"
            value={form.bearer_token}
            onChange={(event) => setForm({ ...form, bearer_token: event.target.value })}
          />
          <button type="submit" disabled={creating}>
            添加私有 Server
          </button>
        </form>
        {error && (
          <div className={styles.error} role="alert">
            {error}
            <button onClick={() => void load()}>重试</button>
          </div>
        )}
        {loading && <div className={styles.empty}>加载中…</div>}
        {!loading && servers.length === 0 && <div className={styles.empty}>暂无 MCP Server</div>}
        {servers.map((server) => (
          <article className={styles.card} key={server.id}>
            <div
              className={styles.header}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ')
                  setExpanded(expanded === server.id ? null : server.id);
              }}
              onClick={() => setExpanded(expanded === server.id ? null : server.id)}
            >
              <div>
                <strong>{server.name}</strong>
                <div className={styles.meta}>
                  {server.scope === 'PRIVATE' ? '私有' : '共享'} · {server.transport} ·{' '}
                  {server.status}
                  {server.last_error ? ` · ${server.last_error}` : ''}
                </div>
              </div>
              <span className={styles.actions}>
                <span role="presentation" onClick={(event) => event.stopPropagation()}>
                  <button
                    aria-label={`刷新 ${server.name}`}
                    title="刷新工具"
                    onClick={() =>
                      void refreshMcpServer(server.id)
                        .then(load)
                        .catch(() => setError('刷新失败，请重试'))
                    }
                  >
                    <RefreshCw size={15} />
                  </button>
                  <input
                    aria-label={`启用 ${server.name}`}
                    type="checkbox"
                    checked={server.enabled}
                    onChange={() => void toggleServer(server)}
                  />
                </span>
              </span>
            </div>
            {expanded === server.id && (
              <div className={styles.tools}>
                {(server.tools ?? []).map((tool) => (
                  <div className={styles.tool} key={tool.id}>
                    <div>
                      <strong>{tool.remote_name}</strong>
                      <div className={styles.tag}>
                        来源：{server.name} · 风险：{tool.risk ?? '未知'} · 兼容：
                        {tool.compatibility}
                      </div>
                    </div>
                    <span>
                      <button
                        className={styles.copy}
                        onClick={() => void navigator.clipboard?.writeText(tool.internal_name)}
                      >
                        复制
                      </button>
                      <input
                        aria-label={`启用 ${tool.remote_name}`}
                        type="checkbox"
                        checked={tool.enabled}
                        disabled={!tool.is_present || tool.compatibility === 'INCOMPATIBLE'}
                        onChange={() => void toggleTool(server.id, tool.id)}
                      />
                    </span>
                  </div>
                ))}
              </div>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
