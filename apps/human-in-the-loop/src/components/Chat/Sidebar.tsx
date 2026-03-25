/**
 * Sidebar — 侧边栏组件
 * 包含新建对话按钮和历史线程列表
 */
import { useState, useCallback } from "react";
import { useThreadStore, useChatStore } from '../../store';
import styles from "./index.module.scss";

export default function Sidebar() {
    const threadsList = useThreadStore(s => s.threadsList);
    const activeThreadId = useThreadStore(s => s.activeThreadId);
    const deleteThread = useThreadStore((s) => s.deleteThread);
    const switchThread = useChatStore((s) => s.switchThread);

    // 侧边栏收起状态
    const [isCollapsed, setIsCollapsed] = useState(false);

    const onNewChat = useCallback(() => switchThread(null), [switchThread]);

    const handleDeleteThread = useCallback(async (id: string) => {
        if (window.confirm("确定要删除这条对话记录吗？")) {
            await deleteThread(id);
            // 如果删除的是当前激活的线程，switchThread(null) 以重置聊天界面流状态
            if (activeThreadId === id) {
                onNewChat();
            }
        }
    }, [deleteThread, activeThreadId, onNewChat]);

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
                            className={`${styles.threadItem} ${activeThreadId === thread_id ? styles.threadItemActive : ""}`}
                            onClick={() => switchThread(thread_id)}
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
