import { useChat } from '../../hooks/useChat';
import { useEffect } from 'react';
import ChatStreamHub from './ChatStreamHub';
import Sidebar from './Sidebar';
import UserPanel from './UserPanel';
import MessageList from './MessageList';
import InputBar from './InputBar';
import AuthScreen from '../Auth';
import { useAuthStore } from '../../store';
import { AuthStatus } from '../../types/auth';
import styles from './index.module.scss';

function ChatShell() {
    // 初始化线程列表和线程 hydrate
    useChat();

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
                        <UserPanel />
                    </div>
                </header>

                {/* ── 消息列表 ── */}
                <MessageList />

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
