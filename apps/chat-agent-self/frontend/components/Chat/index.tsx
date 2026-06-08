import { useEffect } from 'react';
import ChatStreamHub from './ChatStreamHub';
import Sidebar from './Sidebar';
import UserPanel from './UserPanel';
import MessageList from './MessageList';
import QueuePanel from './QueuePanel';
import InputBar from './InputBar';
import AuthScreen from './Auth';
import { getThreadSessionSnapshot, useAuthStore, useChatStore, useThreadStore } from '@frontend/store';
import { AuthStatus } from '@common/types/auth';
import styles from './index.module.scss';

function ChatShell() {
    const selectedThreadId = useThreadStore((s) => s.selectedThreadId);
    const session = useChatStore((state) => getThreadSessionSnapshot(state, selectedThreadId));
    const selectBranch = useChatStore((state) => state.selectBranch);
    const branchDepth = session.activeBranch
        ? session.activeBranch.split('>').filter(Boolean).length
        : 0;
    const branchCheckpointShortId = session.headCheckpoint?.checkpoint_id
        ? session.headCheckpoint.checkpoint_id.slice(0, 8)
        : null;

    return (
        <div className={styles.chatRoot}>
            <ChatStreamHub />
            {/* ── 侧边栏 ── */}
            <Sidebar />

            {/* ── 主聊天区域 ── */}
            <div className={styles.chatMain}>
                {/* ── 顶部标题栏 ── */}
                <header className={styles.chatHeader}>
                    <div className={styles.chatHeaderInner}>
                        <span className={styles.chatLogo}>✦</span>
                        <h1 className={styles.chatTitle}>AI Chat</h1>
                        {session.activeBranch && (
                            <div className={styles.branchPillGroup}>
                                <span className={styles.branchPill}>
                                    分支视图 · 深度 {branchDepth}{branchCheckpointShortId ? ` · ${branchCheckpointShortId}` : ''}
                                </span>
                                <button
                                    className={styles.branchResetButton}
                                    type="button"
                                    onClick={() => selectBranch(selectedThreadId, '')}
                                >
                                    回到最新
                                </button>
                            </div>
                        )}
                        <UserPanel />
                    </div>
                </header>

                {/* ── 消息列表 ── */}
                <MessageList key={selectedThreadId} />

                {/* ── 消息队列 ── */}
                <QueuePanel />

                {/* ── 输入栏 ── */}
                <InputBar />
            </div>
        </div>
    );
}

export default function MarkdownChat() {
    const status = useAuthStore((s) => s.status);
    const currentUser = useAuthStore((s) => s.currentUser);
    const hydrateSession = useAuthStore((s) => s.hydrateSession);

    useEffect(() => {
        hydrateSession();
    }, [hydrateSession]);

    if (status === AuthStatus.LOADING) {
        return (
            <div className={styles.chatLoadingShell}>
                <div className={styles.chatLoadingCard}>正在恢复登录状态...</div>
            </div>
        );
    }

    if (!currentUser) {
        return <AuthScreen />;
    }

    return <ChatShell />;
}
