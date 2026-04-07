/**
 * InputBar — 输入栏组件
 * 包含文本输入框和发送/停止按钮。
 * 当前线程的显示状态来自 chatStore，发送/停止命令交给 streamStore。
 */
import React, { useState } from 'react';
import { getQueuedCommandsSnapshot, getThreadRuntimeSnapshot, getThreadSessionSnapshot, useChatPreferencesStore, useChatStore, useScrollStore, useStreamStore, useThreadStore } from '@frontend/store';
import { ThreadStreamStatus } from '@frontend/types/stream';
import styles from './index.module.scss';

function createClientMessageId() {
    return `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function InputBar() {
    const selectedThreadId = useThreadStore((s) => s.selectedThreadId);
    const session = useChatStore((state) => getThreadSessionSnapshot(state, selectedThreadId));
    const runtime = useStreamStore((state) => getThreadRuntimeSnapshot(state, selectedThreadId));
    const queuedCommands = useStreamStore((state) => getQueuedCommandsSnapshot(state, selectedThreadId));
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
    const isStopping = runtime?.status === ThreadStreamStatus.STOPPING;
    const isPending = runtime?.status === ThreadStreamStatus.PENDING;
    const isBusy = isLoading || isPending || isStopping;
    const isDisabled = isAwaitingReview || isHydrating || isStopping;
    const isModeToggleDisabled = isAwaitingReview || isHydrating || isStopping;

    const handleSubmit = (text: string) => {
        if (!text.trim() || isDisabled) return;
        const normalizedText = text.trim();
        const messageId = createClientMessageId();
        setInput('');
        if (!isBusy) {
            prepareMessage(selectedThreadId, normalizedText, messageId);
        }
        enqueueMessage(
            selectedThreadId,
            normalizedText,
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

    const queueSize = queuedCommands.length;
    const sendButtonLabel = isBusy ? '加入队列' : '发送';
    const hintText = (() => {
        if (isHydrating) {
            return '正在加载当前线程内容...';
        }

        if (isStopping) {
            return '正在停止当前回复，停止完成后会继续处理仍在队列中的消息';
        }

        if (isAwaitingReview) {
            return '请先完成当前工具审核，再继续发送消息';
        }

        if (isLoading && queueSize > 0) {
            return `当前回复进行中，新消息会进入队列；已排队 ${queueSize} 条`;
        }

        if (isLoading) {
            return '当前回复进行中，继续发送会自动进入消息队列';
        }

        if (queueSize > 0) {
            return `当前还有 ${queueSize} 条待处理消息，会按顺序继续执行`;
        }

        if (activeBranch) {
            return '当前正在分支上继续对话，新消息会沿当前分支继续，不会覆盖其他版本';
        }

        if (structuredOutputEnabled) {
            return '结构化输出已开启，回复会优先以卡片、表格和步骤形式渲染';
        }

        return 'Enter 发送，Shift + Enter 换行';
    })();

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
                    <div className={styles.submitActions}>
                        {isLoading && (
                            <button
                                className={styles.stopBtn}
                                type="button"
                                onClick={() => stopThread(selectedThreadId)}
                                aria-label="停止当前回复"
                                title="停止当前回复"
                            >
                                ⏹
                            </button>
                        )}
                        <button
                            className={`${styles.sendBtn} ${input.trim() && !isDisabled ? styles.sendBtnActive : ''}`}
                            type="button"
                            onClick={() => handleSubmit(input)}
                            disabled={!input.trim() || isDisabled}
                            aria-label={sendButtonLabel}
                            title={sendButtonLabel}
                        >
                            ↑
                        </button>
                    </div>
                </div>
            </div>
            <p className={styles.chatHint}>{hintText}</p>
        </footer>
    );
}
