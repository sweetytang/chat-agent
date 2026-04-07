/**
 * InputBar — 输入栏组件
 * 包含文本输入框和发送/停止按钮。
 * 当前线程的显示状态来自 chatStore，发送/停止命令交给 streamStore。
 */
import React, { useState } from 'react';
import { getThreadRuntimeSnapshot, getThreadSessionSnapshot, useChatPreferencesStore, useChatStore, useScrollStore, useStreamStore, useThreadStore } from '@frontend/store';
import { ThreadStreamStatus } from '@frontend/types/stream';
import styles from './index.module.scss';

function createClientMessageId() {
    return `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function InputBar() {
    const selectedThreadId = useThreadStore((s) => s.selectedThreadId);
    const session = useChatStore((state) => getThreadSessionSnapshot(state, selectedThreadId));
    const runtime = useStreamStore((state) => getThreadRuntimeSnapshot(state, selectedThreadId));
    const prepareMessage = useChatStore((s) => s.prepareMessage);
    const enqueueMessage = useStreamStore((s) => s.enqueueMessage);
    const stopThread = useStreamStore((s) => s.stopThread);
    const setAutoScroll = useScrollStore((s) => s.setAutoScroll);
    const deepThinkingEnabled = useChatPreferencesStore((s) => s.deepThinkingEnabled);
    const structuredOutputEnabled = useChatPreferencesStore((s) => s.structuredOutputEnabled);
    const toggleDeepThinking = useChatPreferencesStore((s) => s.toggleDeepThinking);
    const toggleStructuredOutput = useChatPreferencesStore((s) => s.toggleStructuredOutput);
    const { activeBranch, headCheckpoint, isLoading, interrupt, isHydrating } = session;

    const [input, setInput] = useState('');
    const isAwaitingReview = Boolean(interrupt);
    const isPending = runtime?.status === ThreadStreamStatus.PENDING || runtime?.status === ThreadStreamStatus.STOPPING;
    const isDisabled = isLoading || isPending || isAwaitingReview || isHydrating;
    const isModeToggleDisabled = isLoading || isPending || isHydrating;

    const handleSubmit = (text: string) => {
        if (!text.trim() || isDisabled) return;
        const messageId = createClientMessageId();
        setInput('');
        prepareMessage(selectedThreadId, text, messageId);
        enqueueMessage(
            selectedThreadId,
            text,
            messageId,
            headCheckpoint,
            activeBranch,
            {
                deepThinkingEnabled,
                structuredOutputEnabled,
            },
        );
        setAutoScroll(true);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(input);
        }
    };

    return (
        <footer className={styles.chatFooter}>
            <div className={styles.chatInputWrapper}>
                <textarea
                    className={styles.chatInput}
                    rows={1}
                    placeholder="给助手发送消息"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isDisabled}
                />
                <div className={styles.inputActionRow}>
                    <div className={styles.actionGroup}>
                        <button
                            className={styles.modeBtn}
                            type="button"
                            onClick={toggleDeepThinking}
                            disabled={isModeToggleDisabled}
                            aria-pressed={deepThinkingEnabled}
                            data-active={deepThinkingEnabled ? 'true' : 'false'}
                        >
                            <span className={styles.modeBtnIcon} aria-hidden="true">
                                <span className={styles.modeBtnIconCore} />
                            </span>
                            <span className={styles.modeBtnLabel}>深度思考</span>
                        </button>
                        <button
                            className={styles.modeBtn}
                            type="button"
                            onClick={toggleStructuredOutput}
                            disabled={isModeToggleDisabled}
                            aria-pressed={structuredOutputEnabled}
                            data-active={structuredOutputEnabled ? 'true' : 'false'}
                            data-variant="structured"
                        >
                            <span className={styles.modeBtnIcon} aria-hidden="true">
                                <span className={styles.modeBtnIconCore} />
                            </span>
                            <span className={styles.modeBtnLabel}>结构化输出</span>
                        </button>
                    </div>
                    {isLoading ? (
                        <button
                            className={`${styles.sendBtn} ${styles.sendBtnActive}`}
                            onClick={() => stopThread(selectedThreadId)}
                            aria-label="Stop"
                        >
                            ⏹
                        </button>
                    ) : (
                        <button
                            className={`${styles.sendBtn} ${input.trim() && !isDisabled ? styles.sendBtnActive : ''}`}
                            onClick={() => handleSubmit(input)}
                            disabled={!input.trim() || isDisabled}
                            aria-label="Send"
                            title="发送"
                        >
                            ↑
                        </button>
                    )}
                </div>
            </div>
            <p className={styles.chatHint}>
                {isHydrating
                    ? '正在加载当前线程内容...'
                    : activeBranch
                        ? '当前正在分支上继续对话，新消息会沿当前分支继续，不会覆盖其他版本'
                        : isAwaitingReview
                            ? '请先完成当前工具审核，再继续发送消息'
                            : structuredOutputEnabled
                                ? '结构化输出已开启，回复会优先以卡片、表格和步骤形式渲染'
                                : 'Enter 发送，Shift + Enter 换行'}
            </p>
        </footer>
    );
}
