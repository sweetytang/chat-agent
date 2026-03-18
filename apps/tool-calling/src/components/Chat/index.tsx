import { useChat } from '../../hooks/useChat';
import Sidebar from './Sidebar';
import MessageList from './MessageList';
import InputBar from './InputBar';
import styles from './index.module.scss';

export default function MarkdownChat() {
    // 初始化流式连接并同步状态到 store
    useChat();

    return (
        <div className={styles.chatRoot}>
            {/* ── 侧边栏 ── */}
            <Sidebar />

            {/* ── 主聊天区域 ── */}
            <div className={styles.chatMain}>
                {/* ── 顶部标题栏 ── */}
                <header className={styles.chatHeader}>
                    <div className={styles.chatHeaderInner}>
                        <span className={styles.chatLogo}>✦</span>
                        <h1 className={styles.chatTitle}>AI Chat</h1>
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
