/**
 * InputBar — 输入栏组件
 * 包含文本输入框和发送/停止按钮。
 * isLoading、submitMessage、stopMessage 从 Zustand chatStore 读取。
 */
import React, { useState } from 'react';
import { useChatStore } from '../../store';
import styles from './index.module.scss';

export default function InputBar() {
    const isLoading = useChatStore((s) => s.isLoading);
    const submitMessage = useChatStore((s) => s.submitMessage);
    const stopMessage = useChatStore((s) => s.stopMessage);

    const [input, setInput] = useState('');

    const handleSubmit = (text: string) => {
        if (!text.trim() || isLoading) return;
        setInput('');
        submitMessage(text);
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
                    disabled={isLoading}
                />
                {isLoading ? (
                    <button
                        className={styles.sendBtn}
                        onClick={stopMessage}
                        aria-label="Stop"
                    >
                        ⏹
                    </button>
                ) : (
                    <button
                        className={styles.sendBtn}
                        onClick={() => handleSubmit(input)}
                        disabled={!input.trim()}
                        aria-label="Send"
                    >
                        ↑
                    </button>
                )}
            </div>
            <p className={styles.chatHint}>Powered by TenaSourcing</p>
        </footer>
    );
}
