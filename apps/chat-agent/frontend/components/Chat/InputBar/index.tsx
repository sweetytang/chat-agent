import React, { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
    getQueuedCommandsSnapshot,
    getRunMetadataSnapshot,
    getThreadRuntimeSnapshot,
    getThreadSessionSnapshot,
    useChatPreferencesStore,
    useChatStore,
    useScrollStore,
    useStreamStore,
    useThreadStore,
} from '@frontend/store';
import { v4 as uuid } from 'uuid';
import { ThreadStreamStatus } from '@frontend/types/stream';
import styles from './index.module.scss';

export default function InputBar() {
    const selectedThreadId = useThreadStore((state) => state.selectedThreadId);
    const session = useChatStore((state) => getThreadSessionSnapshot(state, selectedThreadId));
    const runtime = useStreamStore((state) => getThreadRuntimeSnapshot(state, selectedThreadId));
    const queuedCommands = useStreamStore((state) => getQueuedCommandsSnapshot(state, selectedThreadId));
    const prepareMessage = useChatStore((state) => state.prepareMessage);
    const enqueueMessage = useStreamStore((state) => state.enqueueMessage);
    const stopThread = useStreamStore((state) => state.stopThread);
    const clearQueuedCommands = useStreamStore((state) => state.clearQueuedCommands);
    const setAutoScroll = useScrollStore((state) => state.setAutoScroll);
    const runMetadata = useChatPreferencesStore(useShallow(getRunMetadataSnapshot));
    const toggleDeepThinking = useChatPreferencesStore((state) => state.toggleDeepThinking);
    const toggleGenerativeUi = useChatPreferencesStore((state) => state.toggleGenerativeUi);
    const toggleStructuredOutput = useChatPreferencesStore((state) => state.toggleStructuredOutput);
    const { activeBranch, headCheckpoint, interrupt, isHydrating, isLoading } = session;

    const [input, setInput] = useState('');
    const queueSize = queuedCommands.length;
    const isAwaitingReview = Boolean(interrupt);
    const isStopping = runtime?.status === ThreadStreamStatus.STOPPING;
    const isPending = runtime?.status === ThreadStreamStatus.PENDING;
    const isBusy = isLoading || isPending || isStopping;
    const isDisabled = isAwaitingReview || isHydrating || isStopping;
    const canSubmit = input.trim().length > 0 && !isDisabled;
    const submitLabel = isLoading ? '停止' : isBusy ? '加入队列' : '发送';

    const modeOptions = [
        {
            label: '深度思考',
            active: runMetadata.deepThinkingEnabled ?? false,
            onClick: toggleDeepThinking,
            variant: 'default',
        },
        {
            label: '生成式 UI',
            active: runMetadata.generativeUiEnabled ?? false,
            onClick: toggleGenerativeUi,
            variant: 'generative',
        },
        {
            label: '结构化卡片',
            active: runMetadata.structuredOutputEnabled ?? false,
            onClick: toggleStructuredOutput,
            variant: 'structured',
        },
    ] as const;

    const statusText = (() => {
        if (isHydrating) {
            return '正在加载当前线程内容...';
        }

        if (isStopping) {
            return '正在停止当前回复，完成后会继续处理排队消息';
        }

        if (isAwaitingReview) {
            return '请先完成当前工具审核，再继续发送消息';
        }

        if (isLoading && queueSize > 0) {
            return `当前回复进行中，已有 ${queueSize} 条消息排队`;
        }

        if (isLoading) {
            return '当前回复进行中，继续发送会自动进入队列';
        }

        if (queueSize > 0) {
            return `当前还有 ${queueSize} 条待处理消息`;
        }

        if (activeBranch) {
            return '当前正在分支上继续对话';
        }

        if (runMetadata.generativeUiEnabled) {
            return '生成式 UI 已开启';
        }

        if (runMetadata.structuredOutputEnabled) {
            return '结构化卡片已开启';
        }

        return 'Enter 发送，Shift + Enter 换行';
    })();

    const handleSubmit = (text: string) => {
        const normalizedText = text.trim();
        if (!normalizedText || isDisabled) {
            return;
        }

        const messageId = uuid();
        setInput('');

        if (!isBusy) {
            prepareMessage(selectedThreadId, normalizedText, messageId);
        }

        enqueueMessage(
            selectedThreadId,
            normalizedText,
            messageId,
            headCheckpoint,
            runMetadata,
        );
        setAutoScroll(true);
    };

    return (
        <footer className={styles.chatFooter}>
            <div className={styles.chatInputWrapper}>
                <textarea
                    className={styles.chatInput}
                    rows={1}
                    placeholder="给助手发送消息"
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            handleSubmit(input);
                        }
                    }}
                    disabled={isDisabled}
                />

                <div className={styles.inputActionRow}>
                    <div className={styles.actionGroup}>
                        {modeOptions.map((option) => (
                            <button
                                key={option.label}
                                className={styles.modeBtn}
                                type="button"
                                onClick={option.onClick}
                                disabled={isDisabled}
                                aria-pressed={option.active}
                                data-active={option.active ? 'true' : 'false'}
                                data-variant={option.variant}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>

                    <div className={styles.submitActions}>
                        {queueSize > 0 && (
                            <button
                                className={styles.secondaryActionBtn}
                                type="button"
                                onClick={() => clearQueuedCommands(selectedThreadId)}
                            >
                                清空排队
                            </button>
                        )}
                        <button
                            className={styles.primaryActionBtn}
                            type="button"
                            onClick={() => {
                                if (isLoading) {
                                    stopThread(selectedThreadId);
                                    return;
                                }

                                handleSubmit(input);
                            }}
                            disabled={isLoading ? false : !canSubmit}
                            data-loading={isLoading ? 'true' : 'false'}
                        >
                            {submitLabel}
                        </button>
                    </div>
                </div>
            </div>

            <p className={styles.chatHint}>{statusText}</p>
        </footer>
    );
}
