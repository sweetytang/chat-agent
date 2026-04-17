import ChatStreamHub from './ChatStreamHub';
import Sidebar from './Sidebar';
import MessageList from './MessageList';
import InputBar from './InputBar';
import { getThreadSessionSnapshot, useChatStore, useThreadStore } from '@frontend/store';
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
            <Sidebar />

            <div className={styles.chatMain}>
                <header className={styles.chatHeader}>
                    <div className={styles.chatHeaderInner}>
                        <div>
                            <h1 className={styles.chatTitle}>Chat Agent</h1>
                            <p className={styles.chatSubtitle}>把界面和状态都尽量收敛到最少。</p>
                        </div>
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
                    </div>
                </header>

                <MessageList />
                <InputBar />
            </div>
        </div>
    );
}

export default function MarkdownChat() {
    return <ChatShell />;
}
