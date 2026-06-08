/**
 * Sidebar — 侧边栏组件
 * 包含新建对话按钮和历史线程列表
 */
import { useState, useCallback, useEffect } from "react";
import { useThreadStore, useChatStore, useStreamStore } from '../../../store';
import styles from "./index.module.scss";

export default function Sidebar() {
    const fetchThreads = useThreadStore(s => s.fetchThreads);
    const threadsList = useThreadStore(s => s.threadsList);
    const selectedThreadId = useThreadStore(s => s.selectedThreadId);
    const setSelectedThreadId = useThreadStore((s) => s.setSelectedThreadId);
    const deleteThread = useThreadStore((s) => s.deleteThread);
    const clearThreadSession = useChatStore((s) => s.clearThreadSession);
    const clearThreadRuntime = useStreamStore((s) => s.clearThreadRuntime);

    // ── 初次加载时拉取线程列表 ──
    useEffect(() => {
        fetchThreads();
    }, [fetchThreads]);

    // 侧边栏收起状态
    const [isCollapsed, setIsCollapsed] = useState(false);

    const onNewChat = useCallback(() => setSelectedThreadId(null), [setSelectedThreadId]);

    const handleDeleteThread = useCallback(async (id: string) => {
        if (window.confirm("确定要删除这条对话记录吗？")) {
            await deleteThread(id);
            clearThreadSession(id);
            clearThreadRuntime(id);
            if (selectedThreadId === id) {
                onNewChat();
            }
        }
    }, [clearThreadRuntime, clearThreadSession, deleteThread, selectedThreadId, onNewChat]);

    return (
        <aside className={`${styles.sidebar} ${isCollapsed ? styles.sidebarCollapsed : ""}`}>
            <div className={styles.sidebarHeader}>
                <div className={styles.sidebarHeaderTop}>
                    {!isCollapsed && <div className={styles.historyTitle}>历史记录</div>}
                    <button
                        className={styles.collapseBtn}
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        title={isCollapsed ? "展开侧边栏" : "收起侧边栏"}
                    >
                        {isCollapsed ? "»" : "«"}
                    </button>
                </div>

                {isCollapsed ? (
                    <button
                        className={styles.newChatBtnSmall}
                        onClick={onNewChat}
                        title="新建对话"
                    >
                        <span className={styles.plusIcon}>+</span>
                    </button>
                ) : (
                    <button className={styles.newChatBtnLarge} onClick={onNewChat}>
                        <span className={styles.plusIcon}>+</span> 新建对话
                    </button>
                )}
            </div>

            <div className={styles.threadList}>
                {threadsList.map((thread) => {
                    const {
                        thread_id,
                        title = '新对话',
                        updated_at,
                        status,
                    } = thread || {};
                    const itemTitle = status === 'interrupted'
                        ? `${title} · 待审核`
                        : title;
                    return (
                        <div
                            key={thread_id}
                            className={`${styles.threadItem} ${selectedThreadId === thread_id ? styles.threadItemActive : ""}`}
                            onClick={() => setSelectedThreadId(thread_id)}
                            title={itemTitle || new Date(updated_at).toLocaleString()}
                        >
                            <div className={styles.threadContent}>
                                {isCollapsed ? "●" : itemTitle}
                            </div>
                            {!isCollapsed && (
                                <button
                                    className={styles.deleteThreadBtn}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteThread(thread_id);
                                    }}
                                    title="删除会话"
                                >
                                    ×
                                </button>
                            )}
                        </div>
                    )
                })}
            </div>
        </aside>
    );
}
