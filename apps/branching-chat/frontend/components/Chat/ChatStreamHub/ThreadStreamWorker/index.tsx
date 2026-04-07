import { useCallback, useEffect, useRef, useState } from 'react';
import { useStream } from '@langchain/react';
import {
    getThreadSessionSnapshot,
    syncStreamData,
    useAuthStore,
    useChatStore,
    useStreamStore,
    useThreadStore,
} from '@frontend/store';
import { resolveCheckpointAnchorForMessages } from '@frontend/services/chat/branching';
import { simpleAgent } from '@backend/services/ai/agent';
import { ASSISTANT_ID } from '@common/constants';
import { SERVER_URL } from '@common/constants';
import type { HITLRequest } from '@common/types/interrupt';
import type { ThreadStreamCommand } from '@frontend/types/stream';

interface ThreadStreamWorkerProps {
    workerId: string;
}

function pickBranchPreference(...candidates: Array<string | null | undefined>) {
    return candidates.find((candidate) => typeof candidate === 'string' && candidate.length > 0) ?? '';
}

function getCommandCheckpointId(command: ThreadStreamCommand) {
    switch (command.type) {
        case 'submitMessage':
            return command.checkpoint?.checkpoint_id ?? '';
        case 'regenerate':
            return command.checkpoint.checkpoint_id ?? '';
        case 'submitReview':
            return command.response.checkpointId ?? '';
        case 'stop':
            return '';
    }
}

function getCommandPreferredBranch(command: ThreadStreamCommand, currentBranch: string) {
    switch (command.type) {
        case 'submitReview':
            return currentBranch;
        case 'submitMessage':
        case 'regenerate':
            return command.preferredBranch;
        case 'stop':
            return '';
    }
}

export default function ThreadStreamWorker({ workerId }: ThreadStreamWorkerProps) {
    const runtime = useStreamStore((state) => state.runtimesById[workerId] ?? null);
    const consumePendingCommand = useStreamStore((s) => s.consumePendingCommand);
    const syncRuntimeLoading = useStreamStore((s) => s.syncRuntimeLoading);
    const markRuntimeError = useStreamStore((s) => s.markRuntimeError);
    const moveDraftRuntimeToThread = useStreamStore((s) => s.moveDraftRuntimeToThread);
    const clearRuntime = useStreamStore((s) => s.clearRuntime);
    const moveDraftSessionToThread = useChatStore((s) => s.moveDraftSessionToThread);
    const refreshThreadSession = useChatStore((s) => s.refreshThreadSession);
    const fetchThreads = useThreadStore((s) => s.fetchThreads);
    const selectedThreadId = useThreadStore((s) => s.selectedThreadId);
    const setSelectedThreadId = useThreadStore((s) => s.setSelectedThreadId);
    const logout = useAuthStore((s) => s.logout);
    const token = useAuthStore((s) => s.token);

    const runtimeThreadId = runtime?.threadId ?? null;
    const session = useChatStore((state) => getThreadSessionSnapshot(state, runtimeThreadId));
    const [boundThreadId, setBoundThreadId] = useState<string | null>(runtimeThreadId);
    const lastExecutedCommandIdRef = useRef<string | null>(null);
    const preferredRefreshBranchRef = useRef<string>("");
    const latestSessionBranchRef = useRef<string>("");
    const latestStreamBranchRef = useRef<string>("");
    const latestResolvedCheckpointAnchorRef = useRef<string>("");
    // 当一次编辑/重生成是从旧 checkpoint 分叉出来时，这个 ref 负责把 UI 锚定到
    // “这个 checkpoint 的最新后代分支”，避免刷新时又退回前一个 sibling。
    const latestOperationCheckpointRef = useRef<string>("");

    const onThreadId = useCallback((threadId: string) => {
        moveDraftSessionToThread(threadId);
        moveDraftRuntimeToThread(threadId);
        if (selectedThreadId === null) {
            setSelectedThreadId(threadId);
        }
        fetchThreads();
    }, [fetchThreads, moveDraftRuntimeToThread, moveDraftSessionToThread, selectedThreadId, setSelectedThreadId]);

    const onFinish = useCallback(async () => {
        fetchThreads();
        const threadId = runtime?.threadId ?? boundThreadId;
        if (!threadId) {
            return;
        }

        await refreshThreadSession(
            threadId,
            pickBranchPreference(
                latestOperationCheckpointRef.current,
                latestResolvedCheckpointAnchorRef.current,
                latestStreamBranchRef.current,
                preferredRefreshBranchRef.current,
                latestSessionBranchRef.current,
            ),
        );
        preferredRefreshBranchRef.current = "";
        latestOperationCheckpointRef.current = "";
    }, [boundThreadId, fetchThreads, refreshThreadSession, runtime?.threadId]);

    const stream = useStream<typeof simpleAgent>({
        apiUrl: SERVER_URL,
        assistantId: ASSISTANT_ID,
        threadId: boundThreadId,
        fetchStateHistory: true,
        defaultHeaders: token ? { Authorization: `Bearer ${token}` } : undefined,
        onThreadId,
        onFinish,
        onError: async (error) => {
            const message = error instanceof Error ? error.message : String(error);
            markRuntimeError(workerId, message);
            if (error instanceof Error && /401|unauthorized/i.test(error.message)) {
                await logout();
            }
        },
    });
    const isAwaitingHumanReview = Boolean(stream.interrupt);
    const effectiveStreamLoading = stream.isLoading && !isAwaitingHumanReview;

    useEffect(() => {
        latestSessionBranchRef.current = session.activeBranch;
    }, [session.activeBranch]);

    useEffect(() => {
        latestStreamBranchRef.current = stream.branch;
    }, [stream.branch]);

    useEffect(() => {
        if (effectiveStreamLoading) {
            return;
        }

        latestResolvedCheckpointAnchorRef.current = resolveCheckpointAnchorForMessages(
            (stream.history as any) ?? [],
            stream.messages,
        ) ?? "";
    }, [effectiveStreamLoading, stream.history, stream.messages]);


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

        const payload: Parameters<typeof syncStreamData>[1] = {
            messages: stream.messages,
            toolCalls: stream.toolCalls,
            isLoading: effectiveStreamLoading,
            interrupt: stream.interrupt ? { value: stream.interrupt.value as HITLRequest } : null,
        };

        if (!effectiveStreamLoading) {
            payload.history = stream.history as any;
            payload.activeBranch = pickBranchPreference(
                latestOperationCheckpointRef.current,
                latestResolvedCheckpointAnchorRef.current,
                stream.branch,
                preferredRefreshBranchRef.current,
                latestSessionBranchRef.current,
            );
        }

        syncStreamData(runtime.threadId, payload);
    }, [effectiveStreamLoading, runtime, stream.branch, stream.history, stream.interrupt, stream.messages, stream.toolCalls]);


    // 根据 stream.isLoading 更新 runtime.status
    useEffect(() => {
        if (!runtime) {
            return;
        }

        syncRuntimeLoading(workerId, effectiveStreamLoading);
    }, [effectiveStreamLoading, runtime, syncRuntimeLoading, workerId]);


    // 自主执行任务
    useEffect(() => {
        if (!runtime?.pendingCommand) {
            return;
        }

        const { pendingCommand } = runtime;
        if (lastExecutedCommandIdRef.current === pendingCommand.id) {
            return;
        }

        lastExecutedCommandIdRef.current = pendingCommand.id;
        consumePendingCommand(workerId, pendingCommand.id);
        preferredRefreshBranchRef.current = getCommandPreferredBranch(
            pendingCommand,
            latestSessionBranchRef.current,
        );
        latestOperationCheckpointRef.current = getCommandCheckpointId(pendingCommand);

        switch (pendingCommand.type) {
            case 'submitMessage':
                stream.submit({
                    messages: [{ type: 'human', id: pendingCommand.messageId, content: pendingCommand.text }],
                }, pendingCommand.checkpoint ? { checkpoint: pendingCommand.checkpoint } : undefined);
                break;
            case 'regenerate':
                stream.submit(undefined, { checkpoint: pendingCommand.checkpoint });
                break;
            case 'submitReview':
                stream.submit(null, { command: { resume: pendingCommand.response } });
                break;
            case 'stop':
                stream.stop();
                break;
        }
    }, [consumePendingCommand, runtime, stream, workerId]);


    // 清除不活跃的 worker
    useEffect(() => {
        if (runtime?.status !== 'idle') {
            return;
        }

        clearRuntime(workerId);
    }, [clearRuntime, runtime?.status, workerId]);

    return null;
}
