/**
 * MessageList — 消息列表组件（虚拟滚动版）
 * 使用 react-virtuoso 实现虚拟化渲染，并接入消息分支编辑与切换。
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { useShallow } from 'zustand/react/shallow';
import { THREAD_START_CHECKPOINT_ID } from '@common/constants';
import CollapsibleBox from '@frontend/components/CollapsibleBox';
import { getRunMetadataSnapshot, getThreadSessionSnapshot, useChatPreferencesStore, useChatStore, useStreamStore, useThreadStore } from '@frontend/store';
import { useScrollStore } from '@frontend/store';
import ApprovalCard from './ApprovalCard';
import MessageBubble from './MessageBubble';
import PresetCards from './PresetCards';
import { v4 as uuid } from 'uuid';
import styles from './index.module.scss';

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

// 补全工具消息的执行结果
function completeToolMessageWithResult(
    msg: any,
    toolCalls: any[],
    messages: any[],
) {
    const msgToolCallDefs = msg.tool_calls ?? [];
    if (msgToolCallDefs.length === 0) return [];

    const toolCallMap = new Map(
        (toolCalls ?? []).map((tc: any) => [tc.call?.id, tc]),
    );

    return msgToolCallDefs.map((toolCall: any, idx: number) => {
        const existing = toolCallMap.get(toolCall.id);
        if (existing) {
            return existing;
        }

        const resultMsg = messages.find(
            (message: any) =>
                ToolMessage.isInstance(message) &&
                message.tool_call_id === toolCall.id,
        );

        return {
            id: toolCall.id,
            call: toolCall,
            result: resultMsg || undefined,
            aiMessage: msg,
            index: idx,
            state: resultMsg ? 'completed' : 'pending',
        };
    });
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
    const runMetadata = useChatPreferencesStore(useShallow(getRunMetadataSnapshot));
    const autoScroll = useScrollStore((state) => state.autoScroll);
    const setAutoScroll = useScrollStore((state) => state.setAutoScroll);
    const approvalInterrupt = interrupt?.value ? interrupt : null;
    const virtuosoRef = useRef<VirtuosoHandle | null>(null);
    const toolLookupMessages = useMemo(() => {
        if (!headCheckpoint?.checkpoint_id) {
            return messages;
        }

        const currentState = history.find((item) => item.checkpoint?.checkpoint_id === headCheckpoint.checkpoint_id);
        return Array.isArray(currentState?.values?.messages) ? currentState.values.messages : messages;
    }, [headCheckpoint?.checkpoint_id, history, messages]);


    useEffect(() => {
        if (!selectedThreadId) {
            return;
        }

        ensureThreadSession(selectedThreadId);
    }, [ensureThreadSession, selectedThreadId]);

    const virtualItems: VirtualItem[] = useMemo(() => {
        const items: VirtualItem[] = messages.flatMap((msg, idx) => (
            HumanMessage.isInstance(msg) || AIMessage.isInstance(msg)
                ? [{
                    type: 'message' as const,
                    msg,
                    idx,
                }]
                : []
        ));

        if (approvalInterrupt) {
            items.push({ type: 'approval' });
        }

        if (isLoading) {
            items.push({ type: 'typing' });
        }

        return items;
    }, [approvalInterrupt, isLoading, messages]);

    useEffect(() => {
        if (!autoScroll) {
            return;
        }

        requestAnimationFrame(() => {
            virtuosoRef.current?.autoscrollToBottom();
        });
    }, [autoScroll]);

    const submit = useCallback((text: string) => {
        const messageId = uuid();
        prepareMessage(selectedThreadId, text, messageId);
        enqueueMessage(selectedThreadId, text, messageId, headCheckpoint, runMetadata);
        setAutoScroll(true);
    }, [enqueueMessage, headCheckpoint, prepareMessage, runMetadata, selectedThreadId, setAutoScroll]);

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
            if (!approvalInterrupt?.value) {
                return null;
            }

            const approvalRequest = approvalInterrupt.value;
            const approvalRequestId = approvalRequest.requestId;

            return (
                <div className={`${styles.bubbleRow} ${styles.bubbleRowAi}`}>
                    <div className={styles.bubbleAvatar}>⚠</div>
                    <div className={styles.approvalWrapper}>
                        <CollapsibleBox
                            collapseKey={`approval-${approvalRequestId ?? 'pending-review'}`}
                            maxCollapsedHeight={360}
                            expandLabel="展开审核卡片"
                            collapseLabel="收起审核卡片"
                        >
                            <ApprovalCard
                                interrupt={approvalInterrupt}
                                submitting={isLoading}
                                onRespond={(response) => {
                                    prepareReview(selectedThreadId);
                                    enqueueReview(selectedThreadId, {
                                        ...response,
                                        actionRequests: approvalRequest.actionRequests,
                                        ...(approvalRequestId ? { requestId: approvalRequestId } : {}),
                                        checkpointId: headCheckpoint?.checkpoint_id ?? null,
                                        checkpoint: headCheckpoint?.checkpoint_id
                                            ? {
                                                checkpoint_id: headCheckpoint.checkpoint_id,
                                                checkpoint_ns: headCheckpoint.checkpoint_ns,
                                                checkpoint_map: headCheckpoint.checkpoint_map ?? null,
                                            }
                                            : null,
                                    }, runMetadata);
                                    setAutoScroll(true);
                                }}
                            />
                        </CollapsibleBox>
                    </div>
                </div>
            );
        }

        const { idx, msg } = item;
        const msgId = msg.id ?? idx;
        const isStreamingAiMessage =
            isLoading &&
            idx === messages.length - 1 &&
            AIMessage.isInstance(msg);
        const metadata = messageMetadataById[msgId];

        const onEdit = (text: string) => {
            const editedMessageId = uuid();
            const checkpoint = metadata?.firstSeenState?.parent_checkpoint ?? getThreadStartCheckpoint(selectedThreadId);
            const preferredBranch = activeBranch;
            const baseMessages = getCheckpointMessages(history, checkpoint.checkpoint_id);
            const optimisticMessages = [
                ...baseMessages,
                new HumanMessage({
                    id: editedMessageId,
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
            enqueueMessage(selectedThreadId, text, editedMessageId, checkpoint, runMetadata);
            setAutoScroll(true);
        };

        const onSwitchBranch = (branchId: string) => {
            selectBranch(selectedThreadId, branchId);
            setAutoScroll(true);
        };

        const onRegenerate = () => {
            const checkpoint = metadata?.firstSeenState?.parent_checkpoint;
            if (!checkpoint) {
                return;
            }

            const baseMessages = getCheckpointMessages(history, checkpoint.checkpoint_id);

            prepareBranchRun(selectedThreadId, {
                activeBranch,
                headCheckpoint: checkpoint,
                interrupt: null,
                messageMetadataById: {},
                messages: baseMessages,
                toolCalls: [],
            });
            enqueueRegenerate(selectedThreadId, checkpoint, runMetadata);
            setAutoScroll(true);
        };

        return (
            <MessageBubble
                messageId={msgId}
                controlsDisabled={isLoading || isHydrating}
                isStreamingAiMessage={isStreamingAiMessage}
                message={msg}
                messageToolCalls={AIMessage.isInstance(msg) ? completeToolMessageWithResult(msg, toolCalls, toolLookupMessages) : []}
                metadata={metadata}
                onBranchSwitch={onSwitchBranch}
                onEdit={onEdit}
                onRegenerate={onRegenerate}
            />
        );
    }, [
        enqueueMessage,
        enqueueRegenerate,
        enqueueReview,
        approvalInterrupt,
        isHydrating,
        isLoading,
        activeBranch,
        headCheckpoint,
        history,
        messageMetadataById,
        messages,
        prepareBranchRun,
        prepareReview,
        runMetadata,
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
            increaseViewportBy={{ top: 200, bottom: 200 }}
            defaultItemHeight={80}
            alignToBottom={true}
        />
    );
}
