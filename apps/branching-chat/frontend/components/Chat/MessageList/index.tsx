/**
 * MessageList — 消息列表组件（虚拟滚动版）
 * 使用 react-virtuoso 实现虚拟化渲染，只渲染视窗内的消息。
 * 内置 followOutput 替代手动 useAutoScroll。
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import Markdown from '@frontend/components/Markdown';
import { ToolCard } from './ToolCards';
import ApprovalCard from './ApprovalCard';
import CollapsibleBox from '@frontend/components/CollapsibleBox';
import PresetCards from './PresetCards';
import { getThreadSessionSnapshot, useChatStore, useStreamStore, useThreadStore } from '@frontend/store';
import { useScrollStore } from '@frontend/store';
import styles from './index.module.scss';

function createClientMessageId() {
    return `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── 虚拟列表的统一数据项 ──
type VirtualItem =
    | { type: 'message'; msg: any; idx: number }
    | { type: 'approval' }
    | { type: 'typing' };

/**
 * 获取某条 AI 消息关联的工具调用列表。
 */
function getToolCallsForMessage(
    msg: any,
    toolCalls: any[],
    messages: any[],
): any[] {
    const msgToolCallDefs = msg.tool_calls || [];
    if (msgToolCallDefs.length === 0) return [];

    const fromStream = (toolCalls || []).filter((tc: any) =>
        msgToolCallDefs.some((t: any) => t.id === tc.call.id)
    );

    const foundIds = new Set(fromStream.map((tc: any) => tc.call.id));
    const missing = msgToolCallDefs.filter((t: any) => !foundIds.has(t.id));

    if (missing.length === 0) return fromStream;

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

    const autoScroll = useScrollStore((s) => s.autoScroll);
    const setAutoScroll = useScrollStore((s) => s.setAutoScroll);

    const virtuosoRef = useRef<VirtuosoHandle>(null);

    // ── 切换线程时加载消息 ──
    useEffect(() => {
        if (!selectedThreadId) return;
        void ensureThreadSession(selectedThreadId);
    }, [ensureThreadSession, selectedThreadId]);

    // ── 构建虚拟列表数据项 ──
    const virtualItems: VirtualItem[] = useMemo(() => {
        const items: VirtualItem[] = messages.map((msg, idx) => ({
            type: 'message' as const,
            msg,
            idx,
        }));

        if (interrupt) {
            items.push({ type: 'approval' as const });
        }

        if (isLoading) {
            items.push({ type: 'typing' as const });
        }

        return items;
    }, [messages, interrupt, isLoading]);

    const submit = useCallback((text: string) => {
        const messageId = createClientMessageId();
        prepareMessage(selectedThreadId, text, messageId);
        enqueueMessage(selectedThreadId, text, messageId);
        setAutoScroll(true);
    }, [enqueueMessage, prepareMessage, selectedThreadId, setAutoScroll]);



    // ── followOutput: 新增项时自动跟随 ──
    const handleFollowOutput = useCallback(() => {
        return autoScroll ? 'auto' : false;
    }, [autoScroll]);

    // ── 用户滚动到底部时恢复自动跟随，离开底部时关闭 ──
    // 注意：loading 期间不关闭 autoScroll，避免程序滚动引起的抖动循环
    const handleAtBottomStateChange = useCallback((atBottom: boolean) => {
        if (atBottom) {
            setAutoScroll(true);
        } else if (!isLoading) {
            setAutoScroll(false);
        }
    }, [isLoading, setAutoScroll]);

    // ── 渲染单条虚拟列表项 ──
    const renderItem = useCallback((_index: number, item: VirtualItem) => {
        if (item.type === 'typing') {
            return (
                <div className={`${styles.bubbleRow} ${styles.bubbleRowAi}`}>
                    <div className={styles.bubbleAvatar}>✦</div>
                    <div className={`${styles.bubble} ${styles.bubbleAi} ${styles.typingIndicator}`}>
                        <span /><span /><span />
                    </div>
                </div>
            );
        }

        if (item.type === 'approval') {
            return (
                <div className={`${styles.bubbleRow} ${styles.bubbleRowAi}`}>
                    <div className={styles.bubbleAvatar}>⚠</div>
                    <div className={styles.approvalWrapper}>
                        <CollapsibleBox
                            collapseKey={`approval-${interrupt!.value.requestId}`}
                            maxCollapsedHeight={360}
                            expandLabel="展开审核卡片"
                            collapseLabel="收起审核卡片"
                        >
                            <ApprovalCard
                                interrupt={interrupt!}
                                submitting={isLoading}
                                onRespond={(response) => {
                                    prepareReview(selectedThreadId);
                                    enqueueReview(selectedThreadId, response);
                                    setAutoScroll(true);
                                }}
                            />
                        </CollapsibleBox>
                    </div>
                </div>
            );
        }

        // type === 'message'
        const { msg, idx } = item;
        const msgId = msg.id || `msg-${idx}`;
        const isStreamingAiMessage =
            isLoading &&
            idx === messages.length - 1 &&
            AIMessage.isInstance(msg);

        if (HumanMessage.isInstance(msg)) {
            return (
                <div className={`${styles.bubbleRow} ${styles.bubbleRowHuman}`}>
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
                <div className={`${styles.bubbleRow} ${styles.bubbleRowAi}`}>
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
    }, [enqueueReview, interrupt, isLoading, messages, prepareReview, selectedThreadId, setAutoScroll, toolCalls]);

    // ── 空状态 ──
    if (isHydrating && messages.length === 0) {
        return (
            <main className={styles.chatMessages}>
                <div className={styles.presetsWrapper}>正在加载会话内容...</div>
            </main>
        );
    }

    if (messages.length === 0 && !isHydrating && selectedThreadId === null) {
        return (
            <main className={styles.chatMessages}>
                <PresetCards onSubmit={submit} />
            </main>
        );
    }

    return (
        <Virtuoso
            ref={virtuosoRef}
            className={styles.chatMessages}
            data={virtualItems}
            itemContent={renderItem}
            followOutput={handleFollowOutput}
            atBottomStateChange={handleAtBottomStateChange}
            atBottomThreshold={30}
            initialTopMostItemIndex={virtualItems.length > 0 ? virtualItems.length - 1 : 0}
            increaseViewportBy={{ top: 200, bottom: 200 }}
            defaultItemHeight={80}
        />
    );
}
