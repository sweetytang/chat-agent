/**
 * InputBar — 输入栏组件
 * 包含文本输入框和发送/停止按钮。
 * isLoading、submitMessage、stopMessage 从 Zustand chatStore 读取。
 */
import React, { useState } from 'react';
import { getHasForeignActiveStreamSnapshot, getThreadSessionSnapshot, useChatStore, useThreadStore } from '../../store';
import styles from './index.module.scss';

export default function InputBar() {
    const selectedThreadId = useThreadStore((s) => s.selectedThreadId);
    const session = useChatStore((state) => getThreadSessionSnapshot(state, selectedThreadId));
    const hasForeignActiveStream = useChatStore((state) =>
        getHasForeignActiveStreamSnapshot(state, selectedThreadId),
    );
    const submitMessage = useChatStore((s) => s.submitMessage);
    const stopMessage = useChatStore((s) => s.stopMessage);
    const { isLoading, interrupt, isHydrating } = session;

    const [input, setInput] = useState('');
    const isAwaitingReview = Boolean(interrupt);
    const isDisabled = isLoading || isAwaitingReview || hasForeignActiveStream || isHydrating;

    const handleSubmit = (text: string) => {
        if (!text.trim() || isDisabled) return;
        setInput('');
        submitMessage(selectedThreadId, text);
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
                        onClick={() => stopMessage(selectedThreadId)}
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
                {hasForeignActiveStream
                    ? '另一条线程正在生成，当前线程暂时只支持查看'
                    : isHydrating
                        ? '正在加载当前线程内容...'
                        : isAwaitingReview
                    ? '请先完成当前工具审核，再继续发送消息'
                    : 'Powered by TenaSourcing'}
            </p>
        </footer>
    );
}
