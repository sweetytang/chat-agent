import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Server,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { useUiStore } from '@/app/store/ui';
import { listServerLiveTools, updateMcpServer } from '@/modules/mcp/services/mcpApi';
import type { LiveMcpTool, McpServer } from '@/modules/mcp/types';
import { useMcpSettings } from '../../hooks/useMcpSettings';
import styles from './index.module.css';

const MCP_REGISTRIES = [
  {
    name: 'Official MCP Servers',
    desc: 'Anthropic / MCP 官方维护的参考开源服务合集',
    url: 'https://github.com/modelcontextprotocol/servers',
    tag: '官方标准',
  },
  {
    name: 'Smithery.ai',
    desc: '全网最大的 MCP 注册中心，收录数千款工具，支持直接复制配置',
    url: 'https://smithery.ai/servers',
    tag: '社区热门',
  },
  {
    name: 'Glama MCP 目录',
    desc: '精选高质量开放 MCP Server 集合与安装说明',
    url: 'https://glama.ai/mcp/servers',
    tag: '生态精选',
  },
];

export function McpSettings() {
  const open = useUiStore((state) => state.mcpSettingsOpen);
  const setOpen = useUiStore((state) => state.setMcpSettingsOpen);
  const {
    servers,
    setServers,
    jsonConfig,
    setJsonConfig,
    loading,
    saving,
    error,
    notice,
    saveConfig,
    refresh,
  } = useMcpSettings(open);

  // 当前激活视图: 'add' (全量 JSON 编辑器) 或 serverId
  const [activeTab, setActiveTab] = useState<'add' | string>('add');

  // 动态拉取的 live tools 缓存字典: { [serverId]: LiveMcpTool[] }
  const [liveToolsMap, setLiveToolsMap] = useState<Record<string, LiveMcpTool[]>>({});
  const [loadingTools, setLoadingTools] = useState(false);
  const [toolError, setToolError] = useState<string | null>(null);

  // 记录各个工具卡片的展开/折叠状态，默认折叠 (false)
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});

  // 当前选中的 server
  const selectedServer = useMemo(
    () => servers.find((s) => s.id === activeTab),
    [servers, activeTab],
  );

  // 切换折叠/展开某个 Tool
  const toggleToolExpanded = (toolName: string) => {
    setExpandedTools((prev) => ({
      ...prev,
      [toolName]: !prev[toolName],
    }));
  };

  // 仅在切换到不同 Server (activeTab 变化) 或初次进入时，探测拉取工具；不要依赖 selectedServer 对象引用！
  useEffect(() => {
    if (activeTab === 'add' || !activeTab) return;
    const targetServerId = activeTab;

    let cancelled = false;
    async function fetchTools() {
      try {
        setLoadingTools(true);
        setToolError(null);
        const tools = await listServerLiveTools(targetServerId);
        if (!cancelled) {
          setLiveToolsMap((prev) => ({ ...prev, [targetServerId]: tools }));
        }
      } catch (cause) {
        if (!cancelled) {
          setToolError(cause instanceof Error ? cause.message : '探测工具失败，请检查服务连通性');
        }
      } finally {
        if (!cancelled) setLoadingTools(false);
      }
    }

    void fetchTools();
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  // 处理单个 Server 内部具体 Tool 的开关切换：仅持久化并更新内存状态，不污染用户的原始 jsonConfig！
  const handleToggleTool = async (toolName: string, currentEnabled: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedServer) return;
    const currentRules = selectedServer.tool_rules?.tools ?? {};
    const updatedRules = {
      ...currentRules,
      [toolName]: {
        ...currentRules[toolName],
        enabled: !currentEnabled,
      },
    };

    const updatedToolRules = {
      ...selectedServer.tool_rules,
      tools: updatedRules,
    };

    const updatedServer: McpServer = {
      ...selectedServer,
      tool_rules: updatedToolRules,
    };

    // 1. 本地更新 servers 数组
    const updatedServers = servers.map((s) => (s.id === selectedServer.id ? updatedServer : s));
    setServers(updatedServers);

    // 2. 局部更新 liveToolsMap 状态
    setLiveToolsMap((prev) => {
      const currentList = prev[selectedServer.id] || [];
      return {
        ...prev,
        [selectedServer.id]: currentList.map((t) =>
          t.name === toolName ? { ...t, enabled: !currentEnabled } : t,
        ),
      };
    });

    // 3. 自动即时持久化到数据库
    try {
      await updateMcpServer(selectedServer.id, { tool_rules: updatedToolRules });
    } catch (err) {
      console.error('持久化 Tool 规则失败:', err);
    }
  };

  // 处理单个 Server 内部具体 Tool 的审批开关切换：仅持久化并更新内存状态，不污染用户的原始 jsonConfig！
  const handleToggleApproval = async (
    toolName: string,
    currentRequireApproval: boolean,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    if (!selectedServer) return;
    const currentRules = selectedServer.tool_rules?.tools ?? {};
    const updatedRules = {
      ...currentRules,
      [toolName]: {
        ...currentRules[toolName],
        require_approval: !currentRequireApproval,
      },
    };

    const updatedToolRules = {
      ...selectedServer.tool_rules,
      tools: updatedRules,
    };

    const updatedServer: McpServer = {
      ...selectedServer,
      tool_rules: updatedToolRules,
    };

    // 1. 本地更新 servers 数组
    const updatedServers = servers.map((s) => (s.id === selectedServer.id ? updatedServer : s));
    setServers(updatedServers);

    // 2. 局部更新 liveToolsMap 状态
    setLiveToolsMap((prev) => {
      const currentList = prev[selectedServer.id] || [];
      return {
        ...prev,
        [selectedServer.id]: currentList.map((t) =>
          t.name === toolName ? { ...t, require_approval: !currentRequireApproval } : t,
        ),
      };
    });

    // 3. 自动即时持久化到数据库
    try {
      await updateMcpServer(selectedServer.id, { tool_rules: updatedToolRules });
    } catch (err) {
      console.error('持久化审批规则失败:', err);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.dialog}>
          <Dialog.Description className={styles.visuallyHidden}>
            配置与管理 MCP Servers
          </Dialog.Description>

          <header className={styles.topBar}>
            <div className={styles.titleGroup}>
              <Code2 className={styles.icon} size={20} />
              <div>
                <h2>MCP 配置中心</h2>
                <p>管理 MCP 服务连接、动态拉取工具，并精细化配置 Tool 执行与审批权限。</p>
              </div>
            </div>
            <div className={styles.actionGroup}>
              {/* 应用中心 / MCP 资源导航 */}
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    className={styles.registryButton}
                    title="探索并发现开源 MCP 服务"
                  >
                    <Sparkles size={14} className={styles.sparkleIcon} />
                    <span>应用中心</span>
                    <ChevronDown size={13} className={styles.chevronIcon} />
                  </button>
                </DropdownMenu.Trigger>

                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    align="end"
                    className={styles.registryMenu}
                    sideOffset={6}
                  >
                    <div className={styles.registryMenuHeader}>
                      <span>发现 MCP Servers</span>
                      <small>前往官方或社区发现更多实用服务与工具</small>
                    </div>

                    {MCP_REGISTRIES.map((item) => (
                      <DropdownMenu.Item
                        key={item.name}
                        className={styles.registryMenuItem}
                        onSelect={() => window.open(item.url, '_blank', 'noopener,noreferrer')}
                      >
                        <div className={styles.registryItemInfo}>
                          <div className={styles.registryItemTop}>
                            <span className={styles.registryItemTitle}>{item.name}</span>
                            <span className={styles.registryItemTag}>{item.tag}</span>
                          </div>
                          <span className={styles.registryItemDesc}>{item.desc}</span>
                        </div>
                        <ExternalLink size={14} className={styles.externalIcon} />
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>

              <button
                type="button"
                className={styles.refreshButton}
                onClick={() => void refresh()}
                disabled={loading || saving}
                title="重新载入"
              >
                <RefreshCw size={16} className={loading ? styles.spinning : ''} />
              </button>
              <Dialog.Close asChild>
                <button type="button" className={styles.closeButton} title="关闭">
                  <X size={18} />
                </button>
              </Dialog.Close>
            </div>
          </header>

          <div className={styles.bodyLayout}>
            {/* 左侧：MCP 服务列表与新增入口 */}
            <aside className={styles.sidebar}>
              <button
                type="button"
                className={`${styles.sidebarItem} ${styles.addItem} ${activeTab === 'add' ? styles.activeItem : ''}`}
                onClick={() => setActiveTab('add')}
              >
                <Plus size={16} />
                <span>编辑 / 新增配置 (JSON)</span>
              </button>

              <div className={styles.serverSectionHeader}>已配置的服务 ({servers.length})</div>

              <div className={styles.serverList}>
                {servers.map((server) => (
                  <button
                    key={server.id}
                    type="button"
                    className={`${styles.sidebarItem} ${activeTab === server.id ? styles.activeItem : ''}`}
                    onClick={() => setActiveTab(server.id)}
                  >
                    <Server size={15} className={styles.serverIcon} />
                    <div className={styles.serverItemContent}>
                      <span className={styles.serverName}>{server.name}</span>
                      <span className={styles.serverTransport}>{server.transport}</span>
                    </div>
                  </button>
                ))}
                {servers.length === 0 && !loading && (
                  <div className={styles.emptyTip}>暂无服务，请点击上方按钮添加</div>
                )}
              </div>
            </aside>

            {/* 右侧：内容工作区 */}
            <main className={styles.contentArea}>
              {activeTab === 'add' || !selectedServer ? (
                /* JSON 编辑区 */
                <div className={styles.editorWrapper}>
                  <div className={styles.sectionHeader}>
                    <span>mcpServers JSON 配置</span>
                    <span className={styles.sectionSub}>
                      支持配置远程 (HTTP/SSE) 或本地 (stdio) 服务的全局清单。
                    </span>
                  </div>
                  <textarea
                    className={styles.jsonTextarea}
                    value={jsonConfig}
                    onChange={(e) => setJsonConfig(e.target.value)}
                    placeholder="{\n  &quot;mcpServers&quot;: {}\n}"
                    spellCheck={false}
                  />
                </div>
              ) : (
                /* 点击具体 MCP 出来的 Tool 管理面板 */
                <div className={styles.toolsPanel}>
                  <div className={styles.serverDetailHeader}>
                    <div className={styles.serverMeta}>
                      <h3>{selectedServer.name}</h3>
                      <span className={styles.tag}>{selectedServer.transport}</span>
                      {selectedServer.endpoint && (
                        <span className={styles.endpointText}>{selectedServer.endpoint}</span>
                      )}
                      {selectedServer.command && (
                        <span className={styles.endpointText}>cmd: {selectedServer.command}</span>
                      )}
                    </div>
                  </div>

                  <div className={styles.toolListWrapper}>
                    <div className={styles.sectionHeader}>
                      <span>工具权限与审批管理</span>
                      <span className={styles.sectionSub}>
                        动态探测该服务的真实工具列表，点击折叠/展开详情，配置各工具的启用与审批要求。
                      </span>
                    </div>

                    {loadingTools && (
                      <div className={styles.loadingToolsTip}>
                        <Loader2 size={18} className={styles.spinning} />
                        <span>正在探测该 MCP 服务的实时工具清单...</span>
                      </div>
                    )}

                    {toolError && !loadingTools && (
                      <div className={styles.toolErrorAlert}>
                        <AlertCircle size={16} />
                        <span>{toolError}</span>
                      </div>
                    )}

                    <div className={styles.toolCards}>
                      {(liveToolsMap[selectedServer.id] || []).map((tool) => {
                        const isExpanded = !!expandedTools[tool.name];

                        return (
                          <div
                            key={tool.name}
                            className={`${styles.toolCard} ${isExpanded ? styles.cardExpanded : ''}`}
                            onClick={() => toggleToolExpanded(tool.name)}
                          >
                            <div className={styles.toolHeaderRow}>
                              <div className={styles.toolTitle}>
                                <span className={styles.chevronIcon}>
                                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                </span>
                                <Wrench size={15} className={styles.wrenchIcon} />
                                <strong>{tool.name}</strong>
                              </div>

                              <div className={styles.toolControls} onClick={(e) => e.stopPropagation()}>
                                <label className={styles.switchLabel}>
                                  <span>启用工具</span>
                                  <input
                                    type="checkbox"
                                    checked={tool.enabled}
                                    onChange={(e) => handleToggleTool(tool.name, tool.enabled, e as any)}
                                  />
                                </label>

                                <label className={styles.switchLabel}>
                                  <span>人工审批</span>
                                  <input
                                    type="checkbox"
                                    checked={tool.require_approval}
                                    onChange={(e) =>
                                      handleToggleApproval(tool.name, tool.require_approval, e as any)
                                    }
                                    disabled={!tool.enabled}
                                  />
                                </label>
                              </div>
                            </div>

                            {/* 默认折叠，展开后展示详细描述 */}
                            {isExpanded && tool.description && (
                              <div className={styles.toolExpandContent}>
                                <p className={styles.toolDescription}>{tool.description}</p>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {!loadingTools &&
                        !toolError &&
                        (liveToolsMap[selectedServer.id] || []).length === 0 && (
                          <div className={styles.noToolsTip}>
                            <p>该服务未探测到任何可用工具，或当前连接未返回工具定义。</p>
                          </div>
                        )}
                    </div>
                  </div>
                </div>
              )}
            </main>
          </div>

          <footer className={styles.footer}>
            <div className={styles.messageArea}>
              {error && (
                <div className={styles.errorMessage}>
                  <AlertCircle size={15} />
                  <span>{error}</span>
                </div>
              )}
              {notice && (
                <div className={styles.successMessage}>
                  <CheckCircle2 size={15} />
                  <span>{notice}</span>
                </div>
              )}
            </div>

            <button
              type="button"
              className={styles.saveButton}
              onClick={() => void saveConfig()}
              disabled={saving || loading}
            >
              <Save size={16} />
              <span>{saving ? '保存中...' : '保存并同步配置'}</span>
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
