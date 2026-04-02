/**
 * MessageList — 消息列表组件
 * 负责渲染聊天消息列表（Human 消息、AI 消息、工具调用卡片、HITL 审核卡片、加载指示器）
 * 状态从 Zustand chatStore 读取。
 */
import { useCallback, useEffect } from 'react';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import Markdown from '@frontend/components/Markdown';
import { ToolCard } from './ToolCards';
import ApprovalCard from './ApprovalCard';
import CollapsibleBox from '@frontend/components/CollapsibleBox';
import PresetCards from './PresetCards';
import { getThreadSessionSnapshot, useChatStore, useStreamStore, useThreadStore } from '../../../store';
import { useAutoScroll } from '@frontend/hooks/useAutoScroll';
import styles from './index.module.scss';

function createClientMessageId() {
    return `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

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

    // 1. 先从 stream.toolCalls 中查找
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
    const selectedThreadId = useThreadStore((s) => s.selectedThreadId);
    const session = useChatStore((state) => getThreadSessionSnapshot(state, selectedThreadId));
    const { messages, toolCalls, isLoading, interrupt, isHydrating } = session;
    const prepareMessage = useChatStore((s) => s.prepareMessage);
    const prepareReview = useChatStore((s) => s.prepareReview);
    const ensureThreadSession = useChatStore((s) => s.ensureThreadSession);
    const enqueueMessage = useStreamStore((s) => s.enqueueMessage);
    const enqueueReview = useStreamStore((s) => s.enqueueReview);

    // ── 切换线程时加载消息 ──
    useEffect(() => {
        if (!selectedThreadId) return;
        void ensureThreadSession(selectedThreadId);
    }, [ensureThreadSession, selectedThreadId]);

    // 使用封装好的通用滚动 Hook
    const { containerRef, onScroll, onTouchOrWheel, onPointerDownCapture, forceScroll } = useAutoScroll([
        messages,
        toolCalls,
        interrupt,
        isLoading,
    ]);

    const submit = useCallback((text: string) => {
        const messageId = createClientMessageId();
        prepareMessage(selectedThreadId, text, messageId);
        enqueueMessage(selectedThreadId, text, messageId);
        forceScroll();
    }, [enqueueMessage, forceScroll, prepareMessage, selectedThreadId]);


    return (
        <main
            ref={containerRef}
            className={styles.chatMessages}
            onScroll={onScroll}
            onTouchStart={onTouchOrWheel}
            onWheel={onTouchOrWheel}
            onPointerDownCapture={onPointerDownCapture}
        >
            {/* 空消息时显示预设提示 */}
            {isHydrating && messages.length === 0 && (
                <div className={styles.presetsWrapper}>正在加载会话内容...</div>
            )}
            {messages.length === 0 && !isHydrating && selectedThreadId === null && <PresetCards onSubmit={submit} />}

            {/* 消息列表 */}
            {messages.map((msg, idx) => {
                const msgId = msg.id || `msg-${idx}`;
                const isStreamingAiMessage =
                    isLoading &&
                    idx === messages.length - 1 &&
                    AIMessage.isInstance(msg);

                if (HumanMessage.isInstance(msg)) {
                    return (
                        <div key={msgId} className={`${styles.bubbleRow} ${styles.bubbleRowHuman}`}>
                            <div className={`${styles.bubble} ${styles.bubbleHuman}`}>
                                <CollapsibleBox
                                    collapseKey={msgId}
                                    tone="light"
                                    fade="human"
                                    maxCollapsedHeight={240}
                                >
                                    <Markdown>{msg.text}</Markdown>
                                </CollapsibleBox>
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
                                {msg.text && (
                                    <CollapsibleBox
                                        collapseKey={msgId}
                                        freezeAutoCollapse={isStreamingAiMessage}
                                        maxCollapsedHeight={240}
                                    >
                                        <Markdown streaming={isStreamingAiMessage}>{msg.text}</Markdown>
                                    </CollapsibleBox>
                                )}
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

            {/* ── HITL 审核卡片：当存在中断时显示 ── */}
            {interrupt && (
                <div className={`${styles.bubbleRow} ${styles.bubbleRowAi}`}>
                    <div className={styles.bubbleAvatar}>⚠</div>
                    <div className={styles.approvalWrapper}>
                        <CollapsibleBox
                            collapseKey={`approval-${interrupt.value.requestId}`}
                            maxCollapsedHeight={360}
                            expandLabel="展开审核卡片"
                            collapseLabel="收起审核卡片"
                        >
                            <ApprovalCard
                                interrupt={interrupt}
                                submitting={isLoading}
                                onRespond={(response) => {
                                    prepareReview(selectedThreadId);
                                    enqueueReview(selectedThreadId, response);
                                    forceScroll();
                                }}
                            />
                        </CollapsibleBox>
                    </div>
                </div>
            )}

            {/* 加载中指示器 */}
            {isLoading && (
                <div className={`${styles.bubbleRow} ${styles.bubbleRowAi}`}>
                    <div className={styles.bubbleAvatar}>✦</div>
                    <div className={`${styles.bubble} ${styles.bubbleAi} ${styles.typingIndicator}`}>
                        <span /><span /><span />
                    </div>
                </div>
            )}
        </main>
    );
}
