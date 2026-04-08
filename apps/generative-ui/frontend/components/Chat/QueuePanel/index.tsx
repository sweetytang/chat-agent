import { getQueuedCommandsSnapshot, useStreamStore, useThreadStore } from '@frontend/store';
import type { ThreadStreamCommand } from '@frontend/types/stream';
import styles from './index.module.scss';

function formatCommandTitle(command: ThreadStreamCommand) {
    switch (command.type) {
        case 'submitMessage':
            return '待发送消息';
        case 'regenerate':
            return '待重新生成';
        case 'submitReview':
            return '待处理审核';
    }
}

function formatCommandPreview(command: ThreadStreamCommand) {
    switch (command.type) {
        case 'submitMessage':
            return command.text;
        case 'regenerate':
            return '重新生成当前分支在该 checkpoint 之后的 AI 回复';
        case 'submitReview':
            return `审核决策：${command.response.decision}`;
    }
}

function shorten(text: string, maxLength = 72) {
    if (text.length <= maxLength) {
        return text;
    }

    return `${text.slice(0, maxLength)}...`;
}

export default function QueuePanel() {
    const selectedThreadId = useThreadStore((state) => state.selectedThreadId);
    const queuedCommands = useStreamStore((state) => getQueuedCommandsSnapshot(state, selectedThreadId));
    const cancelQueuedCommand = useStreamStore((state) => state.cancelQueuedCommand);
    const clearQueuedCommands = useStreamStore((state) => state.clearQueuedCommands);

    if (queuedCommands.length === 0) {
        return null;
    }

    return (
        <section className={styles.queuePanel} aria-label="消息队列">
            <div className={styles.queueHeader}>
                <div>
                    <h2 className={styles.queueTitle}>消息队列</h2>
                    <p className={styles.queueSubtitle}>当前回复结束后，会按顺序继续处理这些请求。</p>
                </div>
                <button
                    className={styles.clearButton}
                    type="button"
                    onClick={() => clearQueuedCommands(selectedThreadId)}
                >
                    清空队列
                </button>
            </div>

            <ul className={styles.queueList}>
                {queuedCommands.map((command, index) => (
                    <li key={command.id} className={styles.queueItem}>
                        <div className={styles.queueOrder}>{index + 1}</div>
                        <div className={styles.queueContent}>
                            <div className={styles.queueMetaRow}>
                                <span className={styles.queueItemTitle}>{formatCommandTitle(command)}</span>
                                <time className={styles.queueTime} dateTime={new Date(command.createdAt).toISOString()}>
                                    {new Date(command.createdAt).toLocaleTimeString()}
                                </time>
                            </div>
                            <p className={styles.queuePreview}>{shorten(formatCommandPreview(command))}</p>
                        </div>
                        <button
                            className={styles.cancelButton}
                            type="button"
                            onClick={() => cancelQueuedCommand(selectedThreadId, command.id)}
                        >
                            移除
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
}
