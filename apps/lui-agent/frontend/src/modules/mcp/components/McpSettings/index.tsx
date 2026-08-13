import {
  AlertCircle,
  ArrowLeft,
  ChevronRight,
  FileJson,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  Server,
  SlidersHorizontal,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import { useState } from 'react';

import { useUiStore } from '@/app/store/ui';

import styles from './index.module.css';
import { StatusFooter } from './StatusFooter';
import { enabledCount, serializeMcpServers, statusMeta, useMcpSettings } from './useMcpSettings';

const JSON_TEMPLATE = `{
  "mcpServers": {
    "github": {
      "url": "https://api.githubcopilot.com/mcp/",
      "type": "http",
      "headers": { "Authorization": "Bearer ..." }
    }
  }
}`;

function highlightJson(source: string) {
  const escaped = source.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped.replace(
    /("(?:\\.|[^"\\])*")\s*(?=:)|("(?:\\.|[^"\\])*")|(-?\d+(?:\.\d+)?)|(true|false|null)|([{}[\],:])/g,
    (token, key, string, number, bool, punctuation) => {
      if (key) return `<span class="jsonKey">${key}</span>`;
      if (string) return `<span class="jsonString">${string}</span>`;
      if (number) return `<span class="jsonNumber">${number}</span>`;
      if (bool) return `<span class="jsonBoolean">${bool}</span>`;
      return `<span class="jsonPunctuation">${punctuation}</span>`;
    },
  );
}

export function McpSettings() {
  const close = () => useUiStore.getState().setMcpSettingsOpen(false);
  const {
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
  } = useMcpSettings();
  const jsonSource = jsonConfig || (servers.length ? serializeMcpServers(servers) : JSON_TEMPLATE);
  const jsonLines = jsonSource.split('\n');
  const [activeJsonLine, setActiveJsonLine] = useState(1);

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section className={styles.dialog} aria-label="MCP Server 管理">
        <header className={styles.topbar}>
          <div className={styles.productTitle}>
            <strong>MCP Server 管理</strong>
            <span>连接外部工具，并精确控制向模型暴露的能力</span>
          </div>
          <nav className={styles.categoryTabs} aria-label="扩展分类">
            <button className={styles.categoryActive} type="button">
              MCP
            </button>
            <button type="button" disabled title="即将开放">
              Skills
            </button>
            <button type="button" disabled title="即将开放">
              Plugins
            </button>
          </nav>
          <button className={styles.iconButton} onClick={close} aria-label="关闭 MCP 管理">
            <X size={18} />
          </button>
        </header>

        <div className={styles.workspace}>
          <aside className={styles.sidebar}>
            <div className={styles.searchBox}>
              <Search size={15} />
              <input
                aria-label="搜索 MCP Server"
                placeholder="搜索 Server..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
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
                    onClick={() => selectServer(server)}
                  >
                    <span className={styles.serverIcon}>
                      <Server size={17} />
                    </span>
                    <span className={styles.serverCopy}>
                      <strong>{server.name}</strong>
                      <small>
                        <i className={styles[status.tone]} /> {status.label} · 暴露{' '}
                        {enabledCount(server)}/{total}
                      </small>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                );
              })}
              <button
                className={`${styles.serverItem} ${styles.addServerItem}`}
                type="button"
                onClick={startAdd}
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

          <main className={styles.detail}>
            {showAdd ? (
              <section className={styles.addPanel}>
                <div className={styles.detailHeading}>
                  <button
                    className={styles.backButton}
                    type="button"
                    onClick={() => setShowAdd(false)}
                  >
                    <ArrowLeft size={16} /> 返回
                  </button>
                  <div>
                    <h2>添加 MCP Server</h2>
                    <p>配置远程 HTTP Server，或导入已有 mcp.json。</p>
                  </div>
                </div>
                <div className={styles.modeSwitch}>
                  <button
                    className={editorMode === 'form' ? styles.modeActive : ''}
                    type="button"
                    onClick={() => setEditorMode('form')}
                  >
                    <SlidersHorizontal size={15} />
                    可视化配置
                  </button>
                  <button
                    className={editorMode === 'json' ? styles.modeActive : ''}
                    type="button"
                    onClick={() => setEditorMode('json')}
                  >
                    <FileJson size={15} />
                    原始 JSON
                  </button>
                </div>
                {editorMode === 'form' ? (
                  <form
                    className={styles.settingsForm}
                    onSubmit={(event) => void createServer(event)}
                  >
                    <label>
                      名称
                      <input
                        required
                        value={form.name}
                        placeholder="例如 GitHub"
                        onChange={(event) => setForm({ ...form, name: event.target.value })}
                      />
                    </label>
                    <label>
                      传输方式
                      <select
                        value={form.transport}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            transport: event.target.value as typeof form.transport,
                          })
                        }
                      >
                        <option value="STREAMABLE_HTTP">Remote · Streamable HTTP</option>
                        <option value="SSE">Remote · SSE（待接入）</option>
                        <option value="STDIO">Local · Controlled stdio</option>
                      </select>
                    </label>
                    {form.transport !== 'STDIO' && (
                      <label className={styles.fullField}>
                        Server 地址
                        <input
                          required
                          type="url"
                          value={form.endpoint}
                          placeholder="https://example.com/mcp"
                          onChange={(event) => setForm({ ...form, endpoint: event.target.value })}
                        />
                      </label>
                    )}
                    {form.transport === 'STDIO' && (
                      <>
                        <label className={styles.fullField}>
                          受控命令（管理员预装清单）
                          <input
                            required
                            value={form.command}
                            placeholder="例如 tat-mcp"
                            onChange={(event) => setForm({ ...form, command: event.target.value })}
                          />
                        </label>
                        <label>
                          参数（JSON 数组）
                          <input
                            value={form.args}
                            placeholder='["--config", "mcp.json"]'
                            onChange={(event) => setForm({ ...form, args: event.target.value })}
                          />
                        </label>
                        <label>
                          环境变量（JSON 对象）
                          <input
                            value={form.env}
                            placeholder='{"KEY":"value"}'
                            onChange={(event) => setForm({ ...form, env: event.target.value })}
                          />
                        </label>
                      </>
                    )}
                    <label className={styles.fullField}>
                      自定义 Headers（JSON，可选）
                      <textarea
                        className={styles.inlineJson}
                        value={form.headers}
                        placeholder={'{\n  "X-Workspace": "demo"\n}'}
                        onChange={(event) => setForm({ ...form, headers: event.target.value })}
                      />
                    </label>
                    <label className={styles.fullField}>
                      Bearer Token（可选）
                      <input
                        type="password"
                        autoComplete="off"
                        value={form.bearerToken}
                        placeholder="将被加密保存"
                        onChange={(event) => setForm({ ...form, bearerToken: event.target.value })}
                      />
                    </label>
                    <div className={styles.localHint}>
                      <AlertCircle size={16} />
                      <span>
                        {form.transport === 'STDIO'
                          ? 'stdio 仅允许管理员预装的受控服务；当前部署未开放命令、镜像或挂载配置。'
                          : form.transport === 'SSE'
                            ? 'SSE 配置已保留，但当前 MCP Host 尚未接入 SSE。'
                            : '远程 MCP 使用 HTTPS 地址；凭据将加密保存且不会回显。'}
                      </span>
                    </div>
                    <button className={styles.primaryButton} disabled={busy} type="submit">
                      {busy ? '正在添加…' : '添加 Server'}
                    </button>
                  </form>
                ) : (
                  <div className={styles.jsonEditor}>
                    <div className={styles.codeViewport}>
                      <div className={styles.lineNumbers} aria-hidden="true">
                        {jsonLines.map((_, index) => (
                          <span key={index}>{index + 1}</span>
                        ))}
                      </div>
                      <pre className={styles.jsonCode} aria-hidden="true">
                        {jsonLines.map((line, index) => (
                          <span
                            className={index + 1 === activeJsonLine ? styles.activeJsonLine : ''}
                            key={`${index}-${line}`}
                            dangerouslySetInnerHTML={{ __html: highlightJson(line) || ' ' }}
                          />
                        ))}
                      </pre>
                      <textarea
                        aria-label="原始 MCP JSON"
                        spellCheck={false}
                        value={jsonSource}
                        onChange={(event) => setJsonConfig(event.target.value)}
                        onSelect={(event) =>
                          setActiveJsonLine(
                            event.currentTarget.value
                              .slice(0, event.currentTarget.selectionStart)
                              .split('\n').length,
                          )
                        }
                        placeholder={JSON_TEMPLATE}
                      />
                    </div>
                    <div className={styles.editorFooter}>
                      <span>
                        <i
                          className={jsonValidation.valid ? styles.jsonValid : styles.jsonInvalid}
                        />
                        {jsonConfig.trim()
                          ? `${jsonValidation.label} · ${jsonValidation.detail}`
                          : '通用 MCP 配置模板 · 点击编辑'}
                      </span>
                      <div className={styles.editorActions}>
                        <button
                          type="button"
                          onClick={() => {
                            try {
                              setJsonConfig(JSON.stringify(JSON.parse(jsonSource), null, 2));
                            } catch {
                              setError('JSON 格式无效，无法格式化');
                            }
                          }}
                        >
                          格式化
                        </button>
                        <button
                          type="button"
                          onClick={() => void navigator.clipboard?.writeText(jsonSource)}
                        >
                          复制
                        </button>
                        <button
                          className={styles.primaryButton}
                          disabled={busy || !jsonConfig.trim()}
                          type="button"
                          onClick={() => void importJson()}
                        >
                          导入配置
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            ) : selected ? (
              <>
                <section className={styles.serverHeader}>
                  <span className={styles.largeServerIcon}>
                    <Server size={22} />
                  </span>
                  <div className={styles.serverTitle}>
                    <h2>{selected.name}</h2>
                    <p>
                      <i className={styles[statusMeta(selected).tone]} />{' '}
                      {statusMeta(selected).label} ·{' '}
                      {selected.transport === 'STDIO' ? 'Local Stdio' : 'Remote HTTP'}
                    </p>
                  </div>
                  <label className={styles.switchLabel}>
                    <span>{selected.enabled ? '已启用' : '已停用'}</span>
                    <input
                      type="checkbox"
                      checked={selected.enabled}
                      disabled={busy}
                      onChange={() => void toggleServer(selected)}
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
                        <strong>{statusMeta(selected).label}</strong>
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
                        onClick={() => void testConnection()}
                      >
                        <RefreshCw size={15} className={busy ? styles.spinning : ''} />
                        测试连接
                      </button>
                      <button
                        className={styles.dangerButton}
                        type="button"
                        disabled={busy}
                        onClick={() => void removeSelected()}
                      >
                        <Trash2 size={15} />
                        删除 Server
                      </button>
                    </div>
                  </section>
                )}

                {detailTab === 'tools' && (
                  <section className={styles.tabContent}>
                    <div className={styles.toolToolbar}>
                      <div className={styles.searchBox}>
                        <Search size={15} />
                        <input
                          aria-label="搜索工具"
                          placeholder="搜索工具..."
                          value={toolQuery}
                          onChange={(event) => setToolQuery(event.target.value)}
                        />
                      </div>
                      <button type="button" disabled={busy} onClick={() => void setAllTools(true)}>
                        全部启用
                      </button>
                      <button type="button" disabled={busy} onClick={() => void setAllTools(false)}>
                        全部禁用
                      </button>
                    </div>
                    <div className={styles.toolList}>
                      {filteredTools.length === 0 && (
                        <div className={styles.listMessage}>尚未发现工具，请先测试连接。</div>
                      )}
                      {filteredTools.map((tool) => (
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
                                !selected.enabled ||
                                !tool.is_present ||
                                tool.compatibility === 'INCOMPATIBLE'
                              }
                              onChange={() => void toggleTool(tool)}
                            />
                            <span />
                          </label>
                        </div>
                      ))}
                    </div>
                  </section>
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
                    <form
                      className={styles.settingsForm}
                      onSubmit={(event) => void saveSettings(event)}
                    >
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
                            selected.credential_configured
                              ? '••••••••（已配置，留空则保留）'
                              : '尚未配置'
                          }
                          onChange={(event) =>
                            setForm({ ...form, bearerToken: event.target.value })
                          }
                        />
                      </label>
                      <button className={styles.primaryButton} disabled={busy} type="submit">
                        保存更改
                      </button>
                    </form>
                  </section>
                )}
              </>
            ) : (
              <div className={styles.emptyDetail}>
                <Server size={30} />
                <strong>选择一个 MCP Server</strong>
                <p>查看连接状态、配置与工具暴露范围。</p>
              </div>
            )}
          </main>
        </div>

        <StatusFooter
          error={error}
          notice={notice}
          exposedTools={exposedTools}
          onDismiss={() => {
            setError(null);
            setNotice(null);
          }}
        />
      </section>
    </div>
  );
}
