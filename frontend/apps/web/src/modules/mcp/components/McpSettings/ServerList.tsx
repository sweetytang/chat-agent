import { ChevronRight, Plus, Search, Server } from 'lucide-react';

import { enabledCount, statusMeta } from '@/modules/mcp/domain/config';
import type { McpServer } from '@/modules/mcp/types';

import styles from './index.module.css';

interface ServerListProps {
  servers: McpServer[];
  selectedId: string | null;
  query: string;
  loading: boolean;
  onQueryChange: (query: string) => void;
  onSelect: (server: McpServer) => void;
  onAdd: () => void;
}

export function ServerList({
  servers,
  selectedId,
  query,
  loading,
  onQueryChange,
  onSelect,
  onAdd,
}: ServerListProps) {
  const filteredServers = servers.filter((server) =>
    server.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <aside className={styles.sidebar}>
      <div className={styles.searchBox}>
        <Search size={15} />
        <input
          aria-label="搜索 MCP Server"
          placeholder="搜索 Server..."
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>
      <div className={styles.serverList}>
        {loading && <div className={styles.listMessage}>正在加载…</div>}
        {!loading && filteredServers.length === 0 && (
          <div className={styles.listMessage}>没有匹配的 Server</div>
        )}
        {filteredServers.map((server) => {
          const status = statusMeta(server);
          const total = server.tools?.length ?? 0;
          return (
            <button
              className={`${styles.serverItem} ${selectedId === server.id ? styles.serverItemActive : ''}`}
              key={server.id}
              type="button"
              onClick={() => onSelect(server)}
            >
              <span className={styles.serverIcon}>
                <Server size={17} />
              </span>
              <span className={styles.serverCopy}>
                <strong>{server.name}</strong>
                <small>
                  <i className={styles[status.tone]} /> {status.label} · 暴露 {enabledCount(server)}
                  /{total}
                </small>
              </span>
              <ChevronRight size={15} />
            </button>
          );
        })}
        <button
          className={`${styles.serverItem} ${styles.addServerItem}`}
          type="button"
          onClick={onAdd}
        >
          <span className={styles.serverIcon}>
            <Plus size={17} />
          </span>
          <span className={styles.serverCopy}>
            <strong>新增 MCP Server</strong>
            <small>添加远程 Server 或导入 JSON</small>
          </span>
          <ChevronRight size={15} />
        </button>
      </div>
    </aside>
  );
}
