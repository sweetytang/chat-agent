/**
 * MessageList — 消息列表组件
 * 负责渲染聊天消息列表（Human 消息、AI 消息、工具调用卡片、加载指示器）
 * 状态从 Zustand chatStore 读取。
 */
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import Markdown from '../Markdown';
import { ToolCard } from '../ToolCards';
import PresetCards from './PresetCards';
import { useChatStore } from '../../store';
import { useAutoScroll } from '../../hooks/useAutoScroll';
import styles from './index.module.scss';

/**
 * 获取某条 AI 消息关联的工具调用列表。
 * 优先从 stream.toolCalls 中查找（当前流式会话），
 * 如果未找到（历史消息在新流式开始后丢失），
 * 则从 msg.tool_calls + messages 中的 ToolMessage 重建。
 */
function getToolCallsForMessage(
    msg: any,
    toolCalls: any[],
    messages: any[],
): any[] {
    const msgToolCallDefs = msg.tool_calls || [];
    if (msgToolCallDefs.length === 0) return [];

    // 1. 先从 stream.toolCalls 中查找（当前流式期间，仅包含当前 run 的 tool calls）
    const fromStream = (toolCalls || []).filter((tc: any) =>
        msgToolCallDefs.some((t: any) => t.id === tc.call.id)
    );

    // 2. 找出 stream.toolCalls 中缺失的历史 tool calls
    const foundIds = new Set(fromStream.map((tc: any) => tc.call.id));
    const missing = msgToolCallDefs.filter((t: any) => !foundIds.has(t.id));

    if (missing.length === 0) return fromStream;

    // 3. 对缺失的 tool calls，从 messages 中查找对应的 ToolMessage 作为 result
    const synthetic = missing.map((t: any, idx: number) => {
        const resultMsg = messages.find(
            (m: any) => ToolMessage.isInstance(m) && (m as any).tool_call_id === t.id
        );
        return {
            id: t.id || `${msg.id}-tc-${idx}`,
            call: t,
            result: resultMsg || undefined,
            aiMessage: msg,
            index: idx,
            state: resultMsg ? 'completed' : 'pending',
        };
    });

    return [...fromStream, ...synthetic];
}

export default function MessageList() {
    const messages = useChatStore((s) => s.messages);
    const toolCalls = useChatStore((s) => s.toolCalls);
    const isLoading = useChatStore((s) => s.isLoading);
    const submitMessage = useChatStore((s) => s.submitMessage);

    // 使用封装好的通用滚动 Hook
    const { bottomRef, onScroll, onTouchOrWheel, forceScroll } = useAutoScroll([messages]);

    const submit = useCallback((text: string) => {
        submitMessage(text);
        forceScroll(); // 强制触发滚动
    }, [submitMessage, forceScroll]);


    return (
        <main
            className={styles.chatMessages}
            onScroll={onScroll}
            onTouchStart={onTouchOrWheel}
            onWheel={onTouchOrWheel}
        >
            {/* 空消息时显示预设提示 */}
            {messages.length === 0 && <PresetCards onSubmit={submit} />}

            {/* 消息列表 */}
            {messages.map((msg, idx) => {
                const msgId = msg.id || `msg-${idx}`;
                if (HumanMessage.isInstance(msg)) {
                    return (
                        <div key={msgId} className={`${styles.bubbleRow} ${styles.bubbleRowHuman}`}>
                            <div className={`${styles.bubble} ${styles.bubbleHuman}`}>
                                <Markdown>{msg.text}</Markdown>
                            </div>
                        </div>
                    );
                }
                if (AIMessage.isInstance(msg)) {
                    const messageToolCalls = getToolCallsForMessage(msg, toolCalls, messages);
                    return (
                        <div key={msgId} className={`${styles.bubbleRow} ${styles.bubbleRowAi}`}>
                            <div className={styles.bubbleAvatar}>✦</div>
                            <div className={`${styles.bubble} ${styles.bubbleAi}`}>
                                {msg.text && <Markdown>{msg.text}</Markdown>}
                                {messageToolCalls.length > 0 && (
                                    <div className={styles.toolCallsWrapper}>
                                        {messageToolCalls.map((tc: any, tcIdx: number) => (
                                            <ToolCard key={tc.call?.id || tcIdx} toolCall={tc} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                }
                return null;
            })}


            {/* 加载中指示器 */}
            {isLoading && (
                <div className={`${styles.bubbleRow} ${styles.bubbleRowAi}`}>
                    <div className={styles.bubbleAvatar}>✦</div>
                    <div className={`${styles.bubble} ${styles.bubbleAi} ${styles.typingIndicator}`}>
                        <span /><span /><span />
                    </div>
                </div>
            )}

            <div ref={bottomRef} />
        </main>
    );
}
