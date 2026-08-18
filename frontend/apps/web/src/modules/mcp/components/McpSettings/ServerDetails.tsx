import { AlertCircle, KeyRound, RefreshCw, Server, Trash2 } from 'lucide-react';
import type { Dispatch, FormEvent, SetStateAction } from 'react';

import { enabledCount, statusMeta } from '@/modules/mcp/domain/config';
import type { McpServer, McpTool } from '@/modules/mcp/types';

import styles from './index.module.css';
import { ToolList } from './ToolList';
import type { DetailTab, ServerForm } from '@/modules/mcp/hooks/useMcpSettings';

interface ServerDetailsProps {
  selected: McpServer;
  detailTab: DetailTab;
  setDetailTab: (tab: DetailTab) => void;
  form: ServerForm;
  setForm: Dispatch<SetStateAction<ServerForm>>;
  toolQuery: string;
  setToolQuery: (query: string) => void;
  filteredTools: McpTool[];
  busy: boolean;
  onToggleServer: (server: McpServer) => void;
  onToggleTool: (tool: McpTool) => void;
  onSetAllTools: (enabled: boolean) => void;
  onTestConnection: () => void;
  onRemove: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}

export function ServerDetails({
  selected,
  detailTab,
  setDetailTab,
  form,
  setForm,
  toolQuery,
  setToolQuery,
  filteredTools,
  busy,
  onToggleServer,
  onToggleTool,
  onSetAllTools,
  onTestConnection,
  onRemove,
  onSave,
}: ServerDetailsProps) {
  const status = statusMeta(selected);

  return (
    <>
      <section className={styles.serverHeader}>
        <span className={styles.largeServerIcon}>
          <Server size={22} />
        </span>
        <div className={styles.serverTitle}>
          <h2>{selected.name}</h2>
          <p>
            <i className={styles[status.tone]} /> {status.label} ·{' '}
            {selected.transport === 'STDIO' ? 'Local Stdio' : 'Remote HTTP'}
          </p>
        </div>
        <label className={styles.switchLabel}>
          <span>{selected.enabled ? '已启用' : '已停用'}</span>
          <input
            type="checkbox"
            checked={selected.enabled}
            disabled={busy}
            onChange={() => onToggleServer(selected)}
          />
        </label>
      </section>

      <nav className={styles.detailTabs}>
        <button
          className={detailTab === 'overview' ? styles.detailTabActive : ''}
          type="button"
          onClick={() => setDetailTab('overview')}
        >
          概览与设置
        </button>
        <button
          className={detailTab === 'tools' ? styles.detailTabActive : ''}
          type="button"
          onClick={() => setDetailTab('tools')}
        >
          暴露工具{' '}
          <span className={styles.tabCount}>
            {enabledCount(selected)}/{selected.tools?.length ?? 0}
          </span>
        </button>
        <button
          className={detailTab === 'credentials' ? styles.detailTabActive : ''}
          type="button"
          onClick={() => setDetailTab('credentials')}
        >
          凭据与安全
        </button>
      </nav>

      {detailTab === 'overview' && (
        <section className={styles.tabContent}>
          <div className={styles.infoGrid}>
            <div>
              <span>连接状态</span>
              <strong>{status.label}</strong>
            </div>
            <div>
              <span>传输协议</span>
              <strong>{selected.transport}</strong>
            </div>
            <div>
              <span>作用域</span>
              <strong>{selected.scope === 'PRIVATE' ? '仅当前用户' : '共享'}</strong>
            </div>
            <div>
              <span>安全版本</span>
              <strong>v{selected.security_version}</strong>
            </div>
          </div>
          {selected.last_error && (
            <div className={styles.diagnostic}>
              <AlertCircle size={17} />
              <div>
                <strong>最近一次连接失败</strong>
                <p>{selected.last_error}</p>
              </div>
            </div>
          )}
          <div className={styles.actionRow}>
            <button
              className={styles.secondaryButton}
              type="button"
              disabled={busy}
              onClick={onTestConnection}
            >
              <RefreshCw size={15} className={busy ? styles.spinning : ''} />
              测试连接
            </button>
            <button
              className={styles.dangerButton}
              type="button"
              disabled={busy}
              onClick={onRemove}
            >
              <Trash2 size={15} />
              删除 Server
            </button>
          </div>
        </section>
      )}

      {detailTab === 'tools' && (
        <ToolList
          tools={filteredTools}
          query={toolQuery}
          busy={busy}
          serverEnabled={selected.enabled}
          onQueryChange={setToolQuery}
          onSetAll={onSetAllTools}
          onToggle={onToggleTool}
        />
      )}

      {detailTab === 'credentials' && (
        <section className={styles.tabContent}>
          <div className={styles.securityNote}>
            <KeyRound size={18} />
            <div>
              <strong>凭据已加密且只写</strong>
              <p>现有凭据不会返回到浏览器。留空表示保留，输入新值将覆盖旧值。</p>
            </div>
          </div>
          <form className={styles.settingsForm} onSubmit={onSave}>
            <label>
              Server 名称
              <input
                value={form.name}
                placeholder={selected.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </label>
            <label>
              Server 地址
              <input
                type="url"
                value={form.endpoint}
                placeholder={selected.endpoint ?? ''}
                onChange={(event) => setForm({ ...form, endpoint: event.target.value })}
              />
            </label>
            <label className={styles.fullField}>
              Bearer Token
              <input
                type="password"
                autoComplete="new-password"
                value={form.bearerToken}
                placeholder={
                  selected.credential_configured ? '••••••••（已配置，留空则保留）' : '尚未配置'
                }
                onChange={(event) => setForm({ ...form, bearerToken: event.target.value })}
              />
            </label>
            <button className={styles.primaryButton} disabled={busy} type="submit">
              保存更改
            </button>
          </form>
        </section>
      )}
    </>
  );
}
