/**
 * InputBar — 输入栏组件
 * 包含文本输入框和发送/停止按钮。
 * 当前线程的显示状态来自 chatStore，发送/停止命令交给 streamStore。
 */
import React, { useState } from 'react';
import { getThreadRuntimeSnapshot, getThreadSessionSnapshot, useChatStore, useStreamStore, useThreadStore, useScrollStore } from '@frontend/store';
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
    const { isLoading, interrupt, isHydrating } = session;

    const [input, setInput] = useState('');
    const isAwaitingReview = Boolean(interrupt);
    const isPending = runtime?.status === ThreadStreamStatus.PENDING || runtime?.status === ThreadStreamStatus.STOPPING;
    const isDisabled = isLoading || isPending || isAwaitingReview || isHydrating;

    const handleSubmit = (text: string) => {
        if (!text.trim() || isDisabled) return;
        const messageId = createClientMessageId();
        setInput('');
        prepareMessage(selectedThreadId, text, messageId);
        enqueueMessage(selectedThreadId, text, messageId);
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
                    placeholder="Ask anything… (Enter to send, Shift+Enter for newline)"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isDisabled}
                />
                {isLoading ? (
                    <button
                        className={styles.sendBtn}
                        onClick={() => stopThread(selectedThreadId)}
                        aria-label="Stop"
                    >
                        ⏹
                    </button>
                ) : (
                    <button
                        className={styles.sendBtn}
                        onClick={() => handleSubmit(input)}
                        disabled={!input.trim() || isDisabled}
                        aria-label="Send"
                    >
                        ↑
                    </button>
                )}
            </div>
            <p className={styles.chatHint}>
                {isHydrating
                    ? '正在加载当前线程内容...'
                    : isAwaitingReview
                        ? '请先完成当前工具审核，再继续发送消息'
                        : 'Powered by TenaSourcing'}
            </p>
        </footer>
    );
}
