import { useEffect, useState } from 'react';

import { listMcpServers } from '@/modules/mcp/services/mcpApi';
import type { McpServer } from '@/modules/mcp/types';

import styles from './index.module.css';

export function McpSettings() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listMcpServers().then(setServers).catch(() => setError('MCP 配置加载失败'));
  }, []);

  function toggleTool(serverId: string, toolId: string) {
    setServers((items) => items.map((server) => server.id !== serverId ? server : {
      ...server,
      tools: server.tools?.map((tool) => tool.id === toolId ? { ...tool, enabled: !tool.enabled } : tool),
    }));
  }

  async function copy(value: string) {
    await navigator.clipboard?.writeText(value);
  }

  return <section className={styles.panel} aria-label="MCP 配置">
    {error && <div className={styles.empty}>{error}</div>}
    {!error && servers.length === 0 && <div className={styles.empty}>暂无 MCP Server</div>}
    {servers.map((server) => <article className={styles.card} key={server.id}>
      <div className={styles.header} onClick={() => setExpanded(expanded === server.id ? null : server.id)}>
        <div><strong>{server.name}</strong><div className={styles.meta}>{server.transport} · {server.status}</div></div>
        <input aria-label={`启用 ${server.name}`} type="checkbox" checked={server.status === 'READY'} readOnly />
      </div>
      {expanded === server.id && <div className={styles.tools}>
        {(server.tools ?? []).map((tool) => <div className={styles.tool} key={tool.id}>
          <div><strong>{tool.remote_name}</strong><div className={styles.tag}>来自 {server.name} · {tool.compatibility}</div></div>
          <span><button className={styles.copy} onClick={() => void copy(tool.internal_name)} title="复制全局工具名">复制</button><input aria-label={`启用 ${tool.remote_name}`} type="checkbox" checked={tool.enabled} onChange={() => toggleTool(server.id, tool.id)} /></span>
        </div>)}
      </div>}
    </article>)}
  </section>;
}
