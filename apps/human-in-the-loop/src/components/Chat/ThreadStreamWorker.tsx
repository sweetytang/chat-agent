import { useCallback, useEffect, useRef, useState } from 'react';
import { useStream } from '@langchain/react';
import type { simpleAgent } from '../../backend/services/ai/agent';
import { ASSISTANT_ID, SERVER_URL } from '../../constants';
import {
    syncStreamData,
    useAuthStore,
    useChatStore,
    useStreamStore,
    useThreadStore,
} from '../../store';
import type { HITLRequest } from '../../types/interrupt';

interface ThreadStreamWorkerProps {
    workerId: string;
}

export default function ThreadStreamWorker({ workerId }: ThreadStreamWorkerProps) {
    const runtime = useStreamStore((state) => state.runtimesById[workerId] ?? null);
    const consumePendingCommand = useStreamStore((s) => s.consumePendingCommand);
    const syncRuntimeLoading = useStreamStore((s) => s.syncRuntimeLoading);
    const markRuntimeError = useStreamStore((s) => s.markRuntimeError);
    const moveDraftRuntimeToThread = useStreamStore((s) => s.moveDraftRuntimeToThread);
    const clearRuntime = useStreamStore((s) => s.clearRuntime);
    const moveDraftSessionToThread = useChatStore((s) => s.moveDraftSessionToThread);
    const fetchThreads = useThreadStore((s) => s.fetchThreads);
    const selectedThreadId = useThreadStore((s) => s.selectedThreadId);
    const setSelectedThreadId = useThreadStore((s) => s.setSelectedThreadId);
    const logout = useAuthStore((s) => s.logout);
    const token = useAuthStore((s) => s.token);

    const runtimeThreadId = runtime?.threadId ?? null;
    const [boundThreadId, setBoundThreadId] = useState<string | null>(runtimeThreadId);
    const lastExecutedCommandIdRef = useRef<string | null>(null);

    const onThreadId = useCallback((threadId: string) => {
        moveDraftSessionToThread(threadId);
        moveDraftRuntimeToThread(threadId);
        if (selectedThreadId === null) {
            setSelectedThreadId(threadId);
        }
        fetchThreads();
    }, [fetchThreads, moveDraftRuntimeToThread, moveDraftSessionToThread, selectedThreadId, setSelectedThreadId]);

    const onFinish = useCallback(() => {
        fetchThreads();
    }, [fetchThreads]);

    const stream = useStream<typeof simpleAgent>({
        apiUrl: SERVER_URL,
        assistantId: ASSISTANT_ID,
        threadId: boundThreadId,
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

    useEffect(() => {
        if (!runtime) {
            return;
        }

        if (runtime.threadId === boundThreadId || stream.isLoading) {
            return;
        }

        setBoundThreadId(runtime.threadId);
    }, [boundThreadId, runtime, stream.isLoading]);

    useEffect(() => {
        if (!runtime) {
            return;
        }

        syncStreamData(runtime.threadId, {
            messages: stream.messages,
            toolCalls: stream.toolCalls,
            isLoading: stream.isLoading,
            interrupt: stream.interrupt ? { value: stream.interrupt.value as HITLRequest } : null,
        });
    }, [runtime, stream.interrupt, stream.isLoading, stream.messages, stream.toolCalls]);

    useEffect(() => {
        if (!runtime) {
            return;
        }

        syncRuntimeLoading(workerId, stream.isLoading);
    }, [runtime, stream.isLoading, syncRuntimeLoading, workerId]);

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

        switch (pendingCommand.type) {
            case 'submitMessage':
                stream.submit({
                    messages: [{ type: 'human', id: pendingCommand.messageId, content: pendingCommand.text }],
                });
                break;
            case 'submitReview':
                stream.submit(null, { command: { resume: pendingCommand.response } });
                break;
            case 'stop':
                stream.stop();
                break;
        }
    }, [consumePendingCommand, runtime, stream, workerId]);

    useEffect(() => {
        if (runtime?.status !== 'idle') {
            return;
        }

        clearRuntime(workerId);
    }, [clearRuntime, runtime?.status, workerId]);

    return null;
}
