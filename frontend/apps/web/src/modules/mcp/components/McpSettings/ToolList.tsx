import { Search, Wrench } from 'lucide-react';

import type { McpTool } from '@/modules/mcp/types';

import styles from './index.module.css';

interface ToolListProps {
  tools: McpTool[];
  query: string;
  busy: boolean;
  serverEnabled: boolean;
  onQueryChange: (query: string) => void;
  onSetAll: (enabled: boolean) => void;
  onToggle: (tool: McpTool) => void;
}

export function ToolList({
  tools,
  query,
  busy,
  serverEnabled,
  onQueryChange,
  onSetAll,
  onToggle,
}: ToolListProps) {
  return (
    <section className={styles.tabContent}>
      <div className={styles.toolToolbar}>
        <div className={styles.searchBox}>
          <Search size={15} />
          <input
            aria-label="搜索工具"
            placeholder="搜索工具..."
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </div>
        <button type="button" disabled={busy} onClick={() => onSetAll(true)}>
          全部启用
        </button>
        <button type="button" disabled={busy} onClick={() => onSetAll(false)}>
          全部禁用
        </button>
      </div>
      <div className={styles.toolList}>
        {tools.length === 0 && (
          <div className={styles.listMessage}>尚未发现工具，请先测试连接。</div>
        )}
        {tools.map((tool) => (
          <div className={styles.toolRow} key={tool.id}>
            <span className={styles.toolIcon}>
              <Wrench size={16} />
            </span>
            <div>
              <strong>{tool.remote_name}</strong>
              <p>{tool.description ?? '无工具描述'}</p>
              <small>
                {tool.compatibility}
                {tool.risk ? ` · ${tool.risk}` : ''}
              </small>
            </div>
            <label className={styles.compactSwitch}>
              <span className={styles.visuallyHidden}>切换 {tool.remote_name}</span>
              <input
                type="checkbox"
                checked={tool.enabled}
                disabled={
                  !serverEnabled || !tool.is_present || tool.compatibility === 'INCOMPATIBLE'
                }
                onChange={() => onToggle(tool)}
              />
              <span />
            </label>
          </div>
        ))}
      </div>
    </section>
  );
}
