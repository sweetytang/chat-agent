/**
 * MessageList — 消息列表组件（虚拟滚动版）
 * 使用 react-virtuoso 实现虚拟化渲染，并接入消息分支编辑与切换。
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { THREAD_START_CHECKPOINT_ID } from '@common/constants';
import CollapsibleBox from '@frontend/components/CollapsibleBox';
import { getThreadSessionSnapshot, useChatStore, useStreamStore, useThreadStore } from '@frontend/store';
import { useScrollStore } from '@frontend/store';
import ApprovalCard from './ApprovalCard';
import MessageBubble from './MessageBubble';
import PresetCards from './PresetCards';
import styles from './index.module.scss';

function createClientMessageId() {
    return `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getThreadStartCheckpoint(threadId: string | null) {
    return {
        thread_id: threadId ?? '',
        checkpoint_id: THREAD_START_CHECKPOINT_ID,
        checkpoint_ns: '',
        checkpoint_map: null,
    };
}

type VirtualItem =
    | { type: 'message'; msg: any; idx: number }
    | { type: 'approval' }
    | { type: 'typing' };

function getToolCallsForMessage(
    msg: any,
    toolCalls: any[],
    messages: any[],
): any[] {
    const msgToolCallDefs = msg.tool_calls || [];
    if (msgToolCallDefs.length === 0) return [];

    const fromStream = (toolCalls || []).filter((tc: any) =>
        msgToolCallDefs.some((toolCall: any) => toolCall.id === tc.call.id),
    );
    const foundIds = new Set(fromStream.map((tc: any) => tc.call.id));
    const missing = msgToolCallDefs.filter((toolCall: any) => !foundIds.has(toolCall.id));

    if (missing.length === 0) {
        return fromStream;
    }

    const synthetic = missing.map((toolCall: any, idx: number) => {
        const resultMsg = messages.find(
            (message: any) => ToolMessage.isInstance(message) && (message as any).tool_call_id === toolCall.id,
        );
        return {
            id: toolCall.id || `${msg.id}-tc-${idx}`,
            call: toolCall,
            result: resultMsg || undefined,
            aiMessage: msg,
            index: idx,
            state: resultMsg ? 'completed' : 'pending',
        };
    });

    return [...fromStream, ...synthetic];
}

function getCheckpointMessages(
    history: any[],
    checkpointId: string | null | undefined,
) {
    if (!checkpointId || checkpointId === THREAD_START_CHECKPOINT_ID) {
        return [];
    }

    const state = history.find((item) => item.checkpoint?.checkpoint_id === checkpointId);
    const messages = Array.isArray(state?.values?.messages) ? state.values.messages : [];
    return messages.filter((message: any) => (
        ((message as any)?._getType?.() ?? (message as any)?.type ?? null) !== 'system'
    ));
}

export default function MessageList() {
    const selectedThreadId = useThreadStore((state) => state.selectedThreadId);
    const session = useChatStore((state) => getThreadSessionSnapshot(state, selectedThreadId));
    const {
        activeBranch,
        headCheckpoint,
        history,
        interrupt,
        isHydrating,
        isLoading,
        messageMetadataById,
        messages,
        toolCalls,
    } = session;
    const ensureThreadSession = useChatStore((state) => state.ensureThreadSession);
    const prepareBranchRun = useChatStore((state) => state.prepareBranchRun);
    const prepareMessage = useChatStore((state) => state.prepareMessage);
    const prepareReview = useChatStore((state) => state.prepareReview);
    const selectBranch = useChatStore((state) => state.selectBranch);
    const enqueueMessage = useStreamStore((state) => state.enqueueMessage);
    const enqueueRegenerate = useStreamStore((state) => state.enqueueRegenerate);
    const enqueueReview = useStreamStore((state) => state.enqueueReview);
    const autoScroll = useScrollStore((state) => state.autoScroll);
    const setAutoScroll = useScrollStore((state) => state.setAutoScroll);
    const virtuosoRef = useRef<VirtuosoHandle>(null);

    useEffect(() => {
        if (!selectedThreadId) {
            return;
        }

        void ensureThreadSession(selectedThreadId);
    }, [ensureThreadSession, selectedThreadId]);

    const virtualItems: VirtualItem[] = useMemo(() => {
        const items: VirtualItem[] = messages.map((msg, idx) => ({
            type: 'message',
            msg,
            idx,
        }));

        if (interrupt) {
            items.push({ type: 'approval' });
        }

        if (isLoading) {
            items.push({ type: 'typing' });
        }

        return items;
    }, [interrupt, isLoading, messages]);

    const submit = useCallback((text: string) => {
        const messageId = createClientMessageId();
        prepareMessage(selectedThreadId, text, messageId);
        enqueueMessage(selectedThreadId, text, messageId, headCheckpoint, activeBranch);
        setAutoScroll(true);
    }, [activeBranch, enqueueMessage, headCheckpoint, prepareMessage, selectedThreadId, setAutoScroll]);

    const handleFollowOutput = useCallback(() => (
        autoScroll ? 'auto' : false
    ), [autoScroll]);

    const handleAtBottomStateChange = useCallback((atBottom: boolean) => {
        if (atBottom) {
            setAutoScroll(true);
        } else if (!isLoading) {
            setAutoScroll(false);
        }
    }, [isLoading, setAutoScroll]);

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
                                    enqueueReview(selectedThreadId, {
                                        ...response,
                                        requestId: interrupt!.value.requestId,
                                        checkpointId: headCheckpoint?.checkpoint_id ?? null,
                                    });
                                    setAutoScroll(true);
                                }}
                            />
                        </CollapsibleBox>
                    </div>
                </div>
            );
        }

        const { idx, msg } = item;
        const msgId = typeof msg.id === 'string' ? msg.id : `msg-${idx}`;
        const isStreamingAiMessage =
            isLoading &&
            idx === messages.length - 1 &&
            AIMessage.isInstance(msg);
        const metadata = messageMetadataById[msgId] ?? {
            messageId: msgId,
            branchOptions: [],
            firstSeenState: undefined,
            branch: undefined,
        };

        return (
            <MessageBubble
                controlsDisabled={isLoading || isHydrating}
                isStreamingAiMessage={isStreamingAiMessage}
                key={msgId}
                message={msg}
                messageId={msgId}
                messageToolCalls={AIMessage.isInstance(msg) ? getToolCallsForMessage(msg, toolCalls, messages) : []}
                metadata={metadata}
                onBranchSwitch={(branchId) => {
                    selectBranch(selectedThreadId, branchId);
                    setAutoScroll(true);
                }}
                onEdit={(text) => {
                    const checkpoint = metadata?.firstSeenState?.parent_checkpoint ?? getThreadStartCheckpoint(selectedThreadId);
                    const preferredBranch = activeBranch;
                    const baseMessages = getCheckpointMessages(history, checkpoint.checkpoint_id);
                    const optimisticMessages = [
                        ...baseMessages,
                        new HumanMessage({
                            id: msgId,
                            content: text,
                        }),
                    ];

                    prepareBranchRun(selectedThreadId, {
                        activeBranch: preferredBranch,
                        headCheckpoint: checkpoint.checkpoint_id === THREAD_START_CHECKPOINT_ID ? null : checkpoint,
                        interrupt: null,
                        messageMetadataById: {},
                        messages: optimisticMessages,
                        toolCalls: [],
                    });
                    enqueueMessage(selectedThreadId, text, msgId, checkpoint, preferredBranch);
                    setAutoScroll(true);
                }}
                onRegenerate={() => {
                    const checkpoint = metadata?.firstSeenState?.parent_checkpoint;
                    if (!checkpoint) {
                        return;
                    }
                    const preferredBranch = activeBranch;
                    const baseMessages = getCheckpointMessages(history, checkpoint.checkpoint_id);

                    prepareBranchRun(selectedThreadId, {
                        activeBranch: preferredBranch,
                        headCheckpoint: checkpoint,
                        interrupt: null,
                        messageMetadataById: {},
                        messages: baseMessages,
                        toolCalls: [],
                    });
                    enqueueRegenerate(selectedThreadId, checkpoint, preferredBranch);
                    setAutoScroll(true);
                }}
            />
        );
    }, [
        enqueueMessage,
        enqueueRegenerate,
        enqueueReview,
        interrupt,
        isHydrating,
        isLoading,
        activeBranch,
        headCheckpoint,
        history,
        messageMetadataById,
        messages,
        prepareBranchRun,
        prepareReview,
        selectedThreadId,
        selectBranch,
        setAutoScroll,
        toolCalls,
    ]);

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

    if (messages.length === 0 && !isHydrating && history.length > 0) {
        return (
            <main className={styles.chatMessages}>
                <div className={styles.presetsWrapper}>
                    当前分支没有消息，可以继续在这个分支上提问。
                </div>
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
