import { useCallback, useEffect, useRef, useState } from 'react';
import { unstable_batchedUpdates } from 'react-dom';
import { useStream } from '@langchain/react';
import {
    getWorkerRuntimeSnapshot,
    getThreadSessionSnapshot,
    syncStreamData,
    useChatStore,
    useStreamStore,
    useThreadStore,
} from '@frontend/store';
import { createChatInterrupt } from '@frontend/services/chat/interrupt';
import { simpleAgent } from '@backend/agent/agent';
import { ASSISTANT_ID, SERVER_URL } from '@frontend/constants/server';
import type { ThreadStreamCommand } from '@frontend/types/stream';
import { ThreadStreamStatus } from '@frontend/types/stream';

interface ThreadStreamWorkerProps {
    workerId: string;
}

function pickBranchPreference(...candidates: Array<string | null | undefined>) {
    return candidates.find((candidate) => typeof candidate === 'string' && candidate.length > 0) ?? '';
}

function toLangChainHITLResume(response: NonNullable<Extract<ThreadStreamCommand, { type: 'submitReview' }>['response']>) {
    const actionRequests = Array.isArray(response.actionRequests) && response.actionRequests.length > 0
        ? response.actionRequests
        : [{ args: {}, name: '' }];

    switch (response.decision) {
        case 'approve':
            return {
                decisions: actionRequests.map(() => ({ type: 'approve' as const })),
            };
        case 'reject':
            return {
                decisions: actionRequests.map(() => ({
                    type: 'reject' as const,
                    ...(response.reason ? { message: response.reason } : {}),
                })),
            };
        case 'edit':
            return {
                decisions: actionRequests.map((action, index) => ({
                    type: 'edit' as const,
                    editedAction: {
                        name: action.name ?? action.action ?? '',
                        args: response.argsList?.[index] ?? action.args ?? {},
                    },
                })),
            };
    }
}

function hasMessageWithId(messages: any[], messageId: string) {
    return messages.some((message) => message?.id === messageId);
}

function getCheckpointMessages(history: any[], checkpointId: string | null | undefined) {
    if (!checkpointId) {
        return [];
    }

    const state = history.find((item) => item.checkpoint?.checkpoint_id === checkpointId);
    return state?.values?.messages ?? [];
}

function resolvePreferredBranchFromStream(
    stream: ReturnType<typeof useStream<typeof simpleAgent>>,
    fallback: string,
) {
    for (let index = stream.messages.length - 1; index >= 0; index -= 1) {
        const message = stream.messages[index];
        const branch = stream.getMessagesMetadata(message as any, index)?.branch;
        if (branch) {
            return branch;
        }
    }

    return fallback;
}

export default function ThreadStreamWorker({ workerId }: ThreadStreamWorkerProps) {
    const runtime = useStreamStore((state) => getWorkerRuntimeSnapshot(state, workerId));
    const consumeQueuedCommand = useStreamStore((s) => s.consumeQueuedCommand);
    const consumeStopRequest = useStreamStore((s) => s.consumeStopRequest);
    const syncRuntimeLoading = useStreamStore((s) => s.syncRuntimeLoading);
    const markRuntimeError = useStreamStore((s) => s.markRuntimeError);
    const moveDraftRuntimeToThread = useStreamStore((s) => s.moveDraftRuntimeToThread);
    const clearRuntime = useStreamStore((s) => s.clearRuntime);
    const moveDraftSessionToThread = useChatStore((s) => s.moveDraftSessionToThread);
    const prepareMessage = useChatStore((s) => s.prepareMessage);
    const refreshThreadSession = useChatStore((s) => s.refreshThreadSession);
    const fetchThreads = useThreadStore((s) => s.fetchThreads);
    const selectedThreadId = useThreadStore((s) => s.selectedThreadId);
    const setSelectedThreadId = useThreadStore((s) => s.setSelectedThreadId);

    const runtimeThreadId = runtime?.threadId ?? null;
    const session = useChatStore((state) => getThreadSessionSnapshot(state, runtimeThreadId));
    const [boundThreadId, setBoundThreadId] = useState<string | null>(runtimeThreadId);
    const lastExecutedCommandIdRef = useRef<string | null>(null);
    const lastExecutedStopCommandIdRef = useRef<string | null>(null);
    const isDispatchingQueuedCommandRef = useRef(false);
    const latestResolvedBranchRef = useRef<string>("");
    const nextQueuedCommand = runtime?.queuedCommands[0] ?? null;
    const pendingStopCommandId = runtime?.pendingStopCommandId ?? null;

    const onThreadId = useCallback((threadId: string) => {
        unstable_batchedUpdates(() => {
            moveDraftSessionToThread(threadId);
            moveDraftRuntimeToThread(threadId);
            if (selectedThreadId === null) {
                setSelectedThreadId(threadId);
            }
        });
        fetchThreads();
    }, [fetchThreads, moveDraftRuntimeToThread, moveDraftSessionToThread, selectedThreadId, setSelectedThreadId]);

    const onFinish = useCallback(async (lastHead?: any, callbackMeta?: { thread_id?: string }) => {
        fetchThreads();
        const threadId = callbackMeta?.thread_id ?? runtime?.threadId ?? boundThreadId;
        if (!threadId) {
            return;
        }

        const preferredBranch = lastHead?.checkpoint?.checkpoint_id
            || latestResolvedBranchRef.current
            || undefined;

        await refreshThreadSession(threadId, preferredBranch);
    }, [boundThreadId, fetchThreads, refreshThreadSession, runtime?.threadId]);

    const stream = useStream<typeof simpleAgent>({
        apiUrl: SERVER_URL,
        assistantId: ASSISTANT_ID,
        threadId: boundThreadId,
        fetchStateHistory: true,
        onThreadId,
        onFinish,
        onError: (error: unknown) => {
            console.error('Thread stream failed', error);
            markRuntimeError(workerId);
        },
    });
    const isAwaitingHumanReview = Boolean(stream.interrupt);
    const effectiveStreamLoading = stream.isLoading && !isAwaitingHumanReview;
    const shouldKeepRuntimeActive = stream.isLoading || isAwaitingHumanReview;

    // useStream hook 需要知道跟哪个线程通信。当 runtime 的 threadId 变化时（比如新对话获得了真实 ID），更新给 useStream。
    // 但如果 stream 正在传输中（isLoading），就不更新——等当前流结束再说。
    useEffect(() => {
        if (!runtime) {
            return;
        }

        if (runtime.threadId === boundThreadId || stream.isLoading) {
            return;
        }

        setBoundThreadId(runtime.threadId);
    }, [boundThreadId, runtime, stream.isLoading]);

    // 本地 UI 允许在线程空闲时直接切换分支，这里在发起流之前把 useStream 的内部 branch 对齐。
    useEffect(() => {
        if (!runtime || stream.isLoading || session.history.length === 0) {
            return;
        }

        if (stream.branch === session.activeBranch) {
            return;
        }

        stream.setBranch(session.activeBranch);
    }, [runtime, session.activeBranch, session.history.length, stream, stream.branch, stream.isLoading]);


    // 同步 stream 数据到 store
    useEffect(() => {
        if (!runtime) {
            return;
        }

        const hasLiveStreamState = effectiveStreamLoading || Boolean(stream.interrupt);
        if (!hasLiveStreamState) {
            if (!session.isLoading) {
                return;
            }

            syncStreamData(runtime.threadId, {
                messages: [],
                toolCalls: [],
                isLoading: false,
                interrupt: null,
            });
            return;
        }

        const resolvedBranch = resolvePreferredBranchFromStream(
            stream,
            pickBranchPreference(stream.branch, session.activeBranch),
        );
        latestResolvedBranchRef.current = resolvedBranch;
        const payload: Parameters<typeof syncStreamData>[1] = {
            messages: stream.messages,
            toolCalls: stream.toolCalls,
            isLoading: effectiveStreamLoading,
            interrupt: createChatInterrupt(stream.interrupt),
        };

        if (stream.interrupt) {
            const currentBranchHistory = stream.history ?? [];
            const currentHead = currentBranchHistory.at(-1);
            payload.headCheckpoint = currentHead?.checkpoint ?? null;
            payload.activeBranch = resolvedBranch;
        }

        syncStreamData(runtime.threadId, payload);
    }, [effectiveStreamLoading, runtime, session.activeBranch, session.isLoading, stream, stream.branch, stream.history, stream.interrupt, stream.messages, stream.toolCalls]);


    // 根据 stream.isLoading 更新 runtime.status
    useEffect(() => {
        if (!runtime) {
            return;
        }

        syncRuntimeLoading(workerId, shouldKeepRuntimeActive);
    }, [runtime, shouldKeepRuntimeActive, syncRuntimeLoading, workerId]);


    // 自主执行任务
    useEffect(() => {
        if (!runtime || !nextQueuedCommand) {
            return;
        }

        if (isDispatchingQueuedCommandRef.current) {
            return;
        }

        if (stream.isLoading || runtime.status === ThreadStreamStatus.STOPPING) {
            return;
        }

        if (lastExecutedCommandIdRef.current === nextQueuedCommand.id) {
            return;
        }

        isDispatchingQueuedCommandRef.current = true;
        lastExecutedCommandIdRef.current = nextQueuedCommand.id;
        consumeQueuedCommand(workerId, nextQueuedCommand.id);
        const metadata = nextQueuedCommand.metadata;

        const dispatchCommand = async () => {
            switch (nextQueuedCommand.type) {
                case 'submitMessage':
                    const optimisticSubmitMessages = nextQueuedCommand.checkpoint?.checkpoint_id
                        ? [
                            ...getCheckpointMessages(session.history, nextQueuedCommand.checkpoint.checkpoint_id),
                            { type: 'human', id: nextQueuedCommand.messageId, content: nextQueuedCommand.text },
                        ]
                        : undefined;
                    if (!hasMessageWithId(session.messages, nextQueuedCommand.messageId)) {
                        prepareMessage(runtime.threadId, nextQueuedCommand.text, nextQueuedCommand.messageId);
                    }
                    await stream.submit({
                        messages: [{ type: 'human', id: nextQueuedCommand.messageId, content: nextQueuedCommand.text }],
                    }, {
                        ...(nextQueuedCommand.checkpoint ? { checkpoint: nextQueuedCommand.checkpoint } : {}),
                        ...(optimisticSubmitMessages ? { optimisticValues: { messages: optimisticSubmitMessages } } : {}),
                        metadata,
                        context: metadata,
                    });
                    break;
                case 'regenerate':
                    const optimisticRegenerateMessages = getCheckpointMessages(
                        session.history,
                        nextQueuedCommand.checkpoint.checkpoint_id,
                    );
                    await stream.submit(undefined, {
                        checkpoint: nextQueuedCommand.checkpoint,
                        optimisticValues: { messages: optimisticRegenerateMessages },
                        metadata,
                        context: metadata,
                    });
                    break;
                case 'submitReview':
                    await stream.submit(null, {
                        ...(nextQueuedCommand.response.checkpoint
                            ? { checkpoint: nextQueuedCommand.response.checkpoint }
                            : {}),
                        command: { resume: toLangChainHITLResume(nextQueuedCommand.response) },
                        metadata,
                        context: metadata,
                    });
                    break;
            }
        };

        void dispatchCommand().finally(() => {
            isDispatchingQueuedCommandRef.current = false;
        });
    }, [
        consumeQueuedCommand,
        nextQueuedCommand,
        prepareMessage,
        runtime,
        session.messages,
        stream,
        workerId,
    ]);


    // 单独处理中断当前流的 stop 请求，避免影响后续排队消息。
    useEffect(() => {
        if (!runtime || !pendingStopCommandId) {
            return;
        }

        if (lastExecutedStopCommandIdRef.current === pendingStopCommandId) {
            return;
        }

        lastExecutedStopCommandIdRef.current = pendingStopCommandId;
        consumeStopRequest(workerId, pendingStopCommandId);
        stream.stop();
    }, [consumeStopRequest, pendingStopCommandId, runtime, stream, workerId]);


    // 清除不活跃的 worker
    useEffect(() => {
        if (runtime?.status !== ThreadStreamStatus.IDLE) {
            return;
        }

        if (runtime.threadId && runtime.threadId === selectedThreadId) {
            return;
        }

        clearRuntime(workerId);
    }, [clearRuntime, runtime?.status, runtime?.threadId, selectedThreadId, workerId]);

    return null;
}
