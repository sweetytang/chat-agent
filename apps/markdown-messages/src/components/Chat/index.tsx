import { useRef, useEffect, useState } from "react";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { useChat } from "../../hooks/useChat";
import Markdown from "../Markdown";
import styles from "./index.module.scss";

import { PRESETS } from "../../constants";

// ─── Main Chat Component ───────────────────────────────────────────────────────
export default function MarkdownChat() {
    const [input, setInput] = useState("");
    const bottomRef = useRef<HTMLDivElement>(null);
    const [isAtBottom, setIsAtBottom] = useState(true);

    const stream = useChat();

    // Auto-scroll to bottom whenever messages update, but only if user is at the bottom
    useEffect(() => {
        if (isAtBottom) {
            bottomRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [stream.messages, isAtBottom]);

    const handleScroll = (e: React.UIEvent<HTMLElement>) => {
        const target = e.currentTarget;
        // Check if user is near the bottom (allow 50px tolerance)
        const atBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 40;
        setIsAtBottom(atBottom);
    };

    const handleSubmit = (text: string) => {
        if (!text.trim() || stream.isLoading) return;
        setInput("");
        setIsAtBottom(true);
        // Force scroll when sending a new message
        setTimeout(() => {
            bottomRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 10);
        stream.submitMessage(text);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(input);
        }
    };

    return (
        <div className={styles.chatRoot}>
            {/* ── Sidebar ── */}
            <aside className={styles.sidebar}>
                <div className={styles.sidebarHeader}>
                    <button
                        className={styles.newChatBtnLarge}
                        onClick={() => {
                            stream.switchThread(null);
                            setInput("");
                        }}
                    >
                        <span className={styles.plusIcon}>+</span> 新建对话
                    </button>
                    <div className={styles.historyTitle}>历史记录</div>
                </div>
                <div className={styles.threadList}>
                    {stream.threadsList.map((thread) => (
                        <div
                            key={thread.thread_id}
                            className={`${styles.threadItem} ${stream.activeThreadId === thread.thread_id ? styles.threadItemActive : ""
                                }`}
                            onClick={() => stream.switchThread(thread.thread_id)}
                            title={new Date(thread.updated_at).toLocaleString()}
                        >
                            {thread.title}
                        </div>
                    ))}
                </div>
            </aside>

            {/* ── Main Chat Area ── */}
            <div className={styles.chatMain}>
                {/* ── Header ── */}
                <header className={styles.chatHeader}>
                    <div className={styles.chatHeaderInner}>
                        <span className={styles.chatLogo}>✦</span>
                        <h1 className={styles.chatTitle}>Markdown Chat</h1>
                    </div>
                </header>

                {/* ── Message list ── */}
                <main className={styles.chatMessages} onScroll={handleScroll}>
                    {stream.messages.length === 0 && (
                        <div className={styles.presetsWrapper}>
                            <p className={styles.presetsLabel}>Try one of these prompts:</p>
                            <div className={styles.presetsGrid}>
                                {PRESETS.map((p) => (
                                    <button
                                        key={p}
                                        className={styles.presetCard}
                                        onClick={() => handleSubmit(p)}
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {stream.messages.map((msg) => {
                        if (HumanMessage.isInstance(msg)) {
                            return (
                                <div key={msg.id} className={`${styles.bubbleRow} ${styles.bubbleRowHuman}`}>
                                    <div className={`${styles.bubble} ${styles.bubbleHuman}`}>
                                        <Markdown className={styles.markdownContent}>{msg.text}</Markdown>
                                    </div>
                                </div>
                            );
                        }
                        if (AIMessage.isInstance(msg)) {
                            return (
                                <div key={msg.id} className={`${styles.bubbleRow} ${styles.bubbleRowAi}`}>
                                    <div className={styles.bubbleAvatar}>✦</div>
                                    <div className={`${styles.bubble} ${styles.bubbleAi}`}>
                                        <Markdown className={styles.markdownContent}>{msg.text}</Markdown>
                                    </div>
                                </div>
                            );
                        }
                        return null;
                    })}

                    {stream.isLoading && (
                        <div className={`${styles.bubbleRow} ${styles.bubbleRowAi}`}>
                            <div className={styles.bubbleAvatar}>✦</div>
                            <div className={`${styles.bubble} ${styles.bubbleAi} ${styles.typingIndicator}`}>
                                <span /><span /><span />
                            </div>
                        </div>
                    )}

                    <div ref={bottomRef} />
                </main>

                {/* ── Input ── */}
                <footer className={styles.chatFooter}>
                    <div className={styles.chatInputWrapper}>
                        <textarea
                            className={styles.chatInput}
                            rows={1}
                            placeholder="Ask anything… (Enter to send, Shift+Enter for newline)"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={stream.isLoading}
                        />
                        {stream.isLoading ? (
                            <button
                                className={styles.sendBtn}
                                onClick={() => stream.stopMessage()}
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
            </div>
        </div>
    );
}
