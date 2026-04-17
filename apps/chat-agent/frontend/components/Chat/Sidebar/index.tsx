import { useCallback, useEffect } from "react";
import { useChatStore, useStreamStore, useThreadStore } from "@frontend/store";
import styles from "./index.module.scss";

export default function Sidebar() {
    const fetchThreads = useThreadStore((state) => state.fetchThreads);
    const threadsList = useThreadStore((state) => state.threadsList);
    const selectedThreadId = useThreadStore((state) => state.selectedThreadId);
    const setSelectedThreadId = useThreadStore((state) => state.setSelectedThreadId);
    const deleteThread = useThreadStore((state) => state.deleteThread);
    const clearThreadSession = useChatStore((state) => state.clearThreadSession);
    const clearThreadRuntime = useStreamStore((state) => state.clearThreadRuntime);

    useEffect(() => {
        fetchThreads();
    }, [fetchThreads]);

    const handleNewChat = useCallback(() => {
        setSelectedThreadId(null);
    }, [setSelectedThreadId]);

    const handleDeleteThread = useCallback(async (threadId: string) => {
        if (!window.confirm("确定要删除这条对话记录吗？")) {
            return;
        }

        await deleteThread(threadId);
        clearThreadSession(threadId);
        clearThreadRuntime(threadId);

        if (selectedThreadId === threadId) {
            handleNewChat();
        }
    }, [clearThreadRuntime, clearThreadSession, deleteThread, handleNewChat, selectedThreadId]);

    return (
        <aside className={styles.sidebar}>
            <div className={styles.sidebarHeader}>
                <div className={styles.historyTitle}>对话列表</div>
                <button
                    className={styles.newChatBtn}
                    type="button"
                    onClick={handleNewChat}
                >
                    新建对话
                </button>
            </div>

            <div className={styles.threadList}>
                {threadsList.length === 0 && (
                    <div className={styles.emptyState}>还没有历史对话</div>
                )}

                {threadsList.map((thread) => {
                    const title = thread.status === 'interrupted'
                        ? `${thread.title || '新对话'} · 待审核`
                        : thread.title || '新对话';

                    return (
                        <div
                            key={thread.thread_id}
                            className={`${styles.threadItem} ${selectedThreadId === thread.thread_id ? styles.threadItemActive : ""}`}
                            onClick={() => setSelectedThreadId(thread.thread_id)}
                            title={title}
                        >
                            <div className={styles.threadContent}>
                                <div className={styles.threadTitle}>{title}</div>
                                <div className={styles.threadTime}>
                                    {new Date(thread.updated_at).toLocaleString()}
                                </div>
                            </div>
                            <button
                                className={styles.deleteThreadBtn}
                                type="button"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    void handleDeleteThread(thread.thread_id);
                                }}
                            >
                                删除
                            </button>
                        </div>
                    );
                })}
            </div>
        </aside>
    );
}
