import * as ScrollArea from '@radix-ui/react-scroll-area';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Blocks, LogIn, PanelLeftClose, PanelLeftOpen, Pin, Search, SquarePen } from 'lucide-react';
import { useEffect } from 'react';

import { BrandMark } from '@/app/components/BrandMark';
import { useUiStore } from '@/app/store/ui';
import { AccountMenu } from '@/modules/auth/components/AccountMenu';
import { useAuthStore } from '@/modules/auth/store/auth';
import { ThreadActions } from '@/modules/threads/components/ThreadActions';
import { ThreadRunStatus } from '@/modules/threads/components/ThreadRunStatus';
import { useThreadStore } from '@/modules/threads/store/thread';

import styles from './index.module.css';

interface SidebarProps {
  collapsed?: boolean;
  onNavigate?: () => void;
}

export function Sidebar({ collapsed = false, onNavigate }: SidebarProps) {
  const threads = useThreadStore((state) => state.threads);
  const threadId = useThreadStore((state) => state.threadId);
  const isLoadingThreads = useThreadStore((state) => state.isLoadingThreads);
  const token = useAuthStore((state) => state.token);

  function startNewThread() {
    if (!token) return;
    useThreadStore.getState().startNewThread();
    onNavigate?.();
  }

  useEffect(() => {
    if (token) void useThreadStore.getState().loadThreads();
  }, [token]);

  if (collapsed)
    return (
      <Tooltip.Provider delayDuration={300}>
        <aside className={styles.rail} aria-label="折叠的会话栏">
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                className={styles.iconButton}
                onClick={() => useUiStore.getState().toggleSidebar()}
                type="button"
                aria-label="展开侧边栏"
              >
                <PanelLeftOpen size={19} />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content className={styles.tooltip} side="right">
                展开侧边栏
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                className={styles.iconButton}
                disabled={!token}
                onClick={startNewThread}
                type="button"
                aria-label="新建会话"
              >
                <SquarePen size={19} />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content className={styles.tooltip} side="right">
                新建会话
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                className={styles.iconButton}
                onClick={() => useUiStore.getState().setThreadSearchOpen(true)}
                type="button"
                aria-label="搜索会话"
              >
                <Search size={19} />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content className={styles.tooltip} side="right">
                搜索会话
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
          <div className={styles.railAccount}>
            {token ? (
              <AccountMenu compact />
            ) : (
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <button
                    className={styles.railLogin}
                    onClick={() => useUiStore.getState().setAuthDialogOpen(true)}
                    type="button"
                    aria-label="登录或注册"
                  >
                    <LogIn size={18} />
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content className={styles.tooltip} side="right">
                    登录 / 注册
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            )}
          </div>
        </aside>
      </Tooltip.Provider>
    );

  return (
    <aside className={styles.sidebar} aria-label="会话列表">
      <div className={styles.header}>
        <div className={styles.brand}>
          <BrandMark size={27} />
          <strong>LUI Agent</strong>
        </div>
        <Tooltip.Provider delayDuration={300}>
          <div className={styles.headerActions}>
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  className={styles.collapseButton}
                  onClick={() => useUiStore.getState().setThreadSearchOpen(true)}
                  type="button"
                  aria-label="搜索会话"
                >
                  <Search size={19} />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content className={styles.tooltip} side="bottom">
                  搜索会话
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  className={`${styles.collapseButton} ${styles.desktopOnly}`}
                  onClick={() => useUiStore.getState().toggleSidebar()}
                  type="button"
                  aria-label="折叠侧边栏"
                >
                  <PanelLeftClose size={19} />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content className={styles.tooltip} side="bottom">
                  折叠侧边栏
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </div>
        </Tooltip.Provider>
      </div>
      <button className={styles.newButton} disabled={!token} onClick={startNewThread} type="button">
        <SquarePen size={18} />
        新建会话
      </button>
      <button
        className={styles.mcpButton}
        disabled={!token}
        onClick={() => {
          useUiStore.getState().setMcpSettingsOpen(true);
          onNavigate?.();
        }}
        type="button"
      >
        <Blocks size={18} />
        MCP 插件配置
      </button>
      {token ? (
        <>
          <ScrollArea.Root className={styles.scroll}>
            <ScrollArea.Viewport className={styles.viewport}>
              {isLoadingThreads ? (
                <div
                  className={styles.threadListLoading}
                  aria-label="正在加载会话列表"
                  aria-live="polite"
                  role="status"
                >
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              ) : threads.length === 0 ? (
                <div className={styles.empty}>
                  <p>还没有保存的会话</p>
                  <button onClick={startNewThread} type="button">
                    开始新会话
                  </button>
                </div>
              ) : (
                threads.map((thread) => (
                  <div
                    className={`${styles.item} ${thread.id === threadId ? styles.active : ''}`}
                    key={thread.id}
                  >
                    <button
                      className={styles.itemLink}
                      onClick={() => {
                        useThreadStore
                          .getState()
                          .setThread(
                            thread.id,
                            thread.title ?? '未命名会话',
                            thread.current_checkpoint_id,
                          );
                        onNavigate?.();
                      }}
                      type="button"
                    >
                      {thread.is_pinned && <Pin className={styles.pin} size={13} />}
                      <span>{thread.title ?? '未命名会话'}</span>
                    </button>
                    <ThreadRunStatus threadId={thread.id} />
                    <ThreadActions thread={thread} onDeleted={onNavigate} />
                  </div>
                ))
              )}
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar className={styles.scrollbar} orientation="vertical">
              <ScrollArea.Thumb className={styles.thumb} />
            </ScrollArea.Scrollbar>
          </ScrollArea.Root>
        </>
      ) : (
        <div className={styles.guest}>
          <p>登录后可查看和管理历史会话。</p>
        </div>
      )}
      <div className={styles.account}>
        {token ? (
          <AccountMenu />
        ) : (
          <button
            className={styles.login}
            onClick={() => useUiStore.getState().setAuthDialogOpen(true)}
            type="button"
          >
            <LogIn size={18} />
            登录 / 注册
          </button>
        )}
      </div>
    </aside>
  );
}
