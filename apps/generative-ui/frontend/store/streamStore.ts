import { create } from "zustand";
import { DRAFT_THREAD_ID } from "@common/constants";
import type { HITLResponse } from "@common/types/interrupt";
import type { RunMetadata } from "@common/types/run";
import type { ThreadCheckpoint } from "@common/types/thread";
import { ThreadRuntime, ThreadStreamCommand, ThreadStreamStatus } from "@frontend/types/stream";

let nextCommandId = 0;
const EMPTY_QUEUED_COMMANDS: ThreadStreamCommand[] = [];

interface StreamState {
    nextRuntimeId: number;
    runtimeIdByThreadKey: Record<string, string>;
    runtimesById: Record<string, ThreadRuntime>;
    enqueueMessage: (
        threadId: string | null,
        text: string,
        messageId: string,
        checkpoint?: ThreadCheckpoint | null,
        preferredBranch?: string,
        metadata?: RunMetadata,
    ) => void;
    enqueueRegenerate: (threadId: string | null, checkpoint: ThreadCheckpoint, preferredBranch?: string, metadata?: RunMetadata) => void;
    enqueueReview: (threadId: string | null, response: HITLResponse, metadata?: RunMetadata) => void;
    stopThread: (threadId: string | null) => void;
    consumeQueuedCommand: (workerId: string, commandId: string) => void;
    consumeStopRequest: (workerId: string, commandId: string) => void;
    cancelQueuedCommand: (threadId: string | null, commandId: string) => void;
    clearQueuedCommands: (threadId: string | null) => void;
    syncRuntimeLoading: (workerId: string, isLoading: boolean) => void;
    markRuntimeError: (workerId: string, error: string | null) => void;
    moveDraftRuntimeToThread: (threadId: string) => void;
    clearThreadRuntime: (threadId: string | null) => void;
    clearRuntime: (workerId: string) => void;
}

function getThreadRuntimeKey(threadId: string | null): string {
    return threadId ?? DRAFT_THREAD_ID;
}

function createRuntime(workerId: string, threadId: string | null): ThreadRuntime {
    return {
        workerId,
        threadId,
        status: ThreadStreamStatus.IDLE,
        queuedCommands: [],
        pendingStopCommandId: null,
        lastError: null,
        lastActiveAt: Date.now(),
    };
}

type ThreadStreamCommandInput =
    | { type: "submitMessage"; text: string; messageId: string; checkpoint: ThreadCheckpoint | null; preferredBranch: string; metadata: RunMetadata }
    | { type: "regenerate"; checkpoint: ThreadCheckpoint; preferredBranch: string; metadata: RunMetadata }
    | { type: "submitReview"; response: HITLResponse; metadata: RunMetadata };

function createCommandId() {
    nextCommandId += 1;
    return `cmd-${nextCommandId}`;
}

function createCommand(command: ThreadStreamCommandInput): ThreadStreamCommand {
    const id = createCommandId();
    const createdAt = Date.now();

    switch (command.type) {
        case "submitMessage":
            return {
                id,
                createdAt,
                type: "submitMessage",
                text: command.text,
                messageId: command.messageId,
                checkpoint: command.checkpoint,
                preferredBranch: command.preferredBranch,
                metadata: command.metadata,
            };
        case "regenerate":
            return {
                id,
                createdAt,
                type: "regenerate",
                checkpoint: command.checkpoint,
                preferredBranch: command.preferredBranch,
                metadata: command.metadata,
            };
        case "submitReview":
            return {
                id,
                createdAt,
                type: "submitReview",
                response: command.response,
                metadata: command.metadata,
            };
    }
}

function appendQueuedCommand(runtime: ThreadRuntime, command: ThreadStreamCommandInput): ThreadRuntime {
    const queuedCommands = [...runtime.queuedCommands, createCommand(command)];

    return {
        ...runtime,
        status: runtime.status === ThreadStreamStatus.IDLE ? ThreadStreamStatus.PENDING : runtime.status,
        queuedCommands,
        lastError: null,
        lastActiveAt: Date.now(),
    };
}

function getOrCreateRuntimeState(state: StreamState, threadId: string | null) {
    const threadKey = getThreadRuntimeKey(threadId);
    const existingWorkerId = state.runtimeIdByThreadKey[threadKey];
    if (existingWorkerId) {
        return {
            threadKey,
            workerId: existingWorkerId,
            runtime: state.runtimesById[existingWorkerId],
            nextRuntimeId: state.nextRuntimeId,
        };
    }

    const workerId = `runtime-${state.nextRuntimeId}`;
    return {
        threadKey,
        workerId,
        runtime: createRuntime(workerId, threadId),
        nextRuntimeId: state.nextRuntimeId + 1,
    };
}

function removeRuntime(state: StreamState, workerId: string) {
    const runtime = state.runtimesById[workerId];
    if (!runtime) {
        return state;
    }

    const nextRuntimesById = { ...state.runtimesById };
    delete nextRuntimesById[workerId];

    const nextRuntimeIdByThreadKey = { ...state.runtimeIdByThreadKey };
    Object.entries(nextRuntimeIdByThreadKey).forEach(([threadKey, runtimeId]) => {
        if (runtimeId === workerId) {
            delete nextRuntimeIdByThreadKey[threadKey];
        }
    });

    return {
        ...state,
        runtimesById: nextRuntimesById,
        runtimeIdByThreadKey: nextRuntimeIdByThreadKey,
    };
}

export const useStreamStore = create<StreamState>((set, get) => ({
    nextRuntimeId: 1,
    runtimeIdByThreadKey: {},
    runtimesById: {},

    enqueueMessage: (
        threadId: string | null,
        text: string,
        messageId: string,
        checkpoint: ThreadCheckpoint | null = null,
        preferredBranch = "",
        metadata = {},
    ) => {
        if (!text.trim()) {
            return;
        }

        set((state) => {
            const { threadKey, workerId, runtime, nextRuntimeId } = getOrCreateRuntimeState(state, threadId);

            return {
                nextRuntimeId,
                runtimeIdByThreadKey: {
                    ...state.runtimeIdByThreadKey,
                    [threadKey]: workerId,
                },
                runtimesById: {
                    ...state.runtimesById,
                    [workerId]: appendQueuedCommand({ ...runtime, threadId }, {
                        type: "submitMessage",
                        text,
                        messageId,
                        checkpoint,
                        preferredBranch,
                        metadata,
                    }),
                },
            };
        });
    },

    enqueueRegenerate: (threadId: string | null, checkpoint: ThreadCheckpoint, preferredBranch = "", metadata = {}) => {
        set((state) => {
            const { threadKey, workerId, runtime, nextRuntimeId } = getOrCreateRuntimeState(state, threadId);

            return {
                nextRuntimeId,
                runtimeIdByThreadKey: {
                    ...state.runtimeIdByThreadKey,
                    [threadKey]: workerId,
                },
                runtimesById: {
                    ...state.runtimesById,
                    [workerId]: appendQueuedCommand({ ...runtime, threadId }, {
                        type: "regenerate",
                        checkpoint,
                        preferredBranch,
                        metadata,
                    }),
                },
            };
        });
    },

    enqueueReview: (threadId: string | null, response: HITLResponse, metadata = {}) => {
        set((state) => {
            const { threadKey, workerId, runtime, nextRuntimeId } = getOrCreateRuntimeState(state, threadId);

            return {
                nextRuntimeId,
                runtimeIdByThreadKey: {
                    ...state.runtimeIdByThreadKey,
                    [threadKey]: workerId,
                },
                runtimesById: {
                    ...state.runtimesById,
                    [workerId]: appendQueuedCommand({ ...runtime, threadId }, {
                        type: "submitReview",
                        response,
                        metadata,
                    }),
                },
            };
        });
    },

    stopThread: (threadId: string | null) => {
        const threadKey = getThreadRuntimeKey(threadId);
        const workerId = get().runtimeIdByThreadKey[threadKey];
        if (!workerId) {
            return;
        }

        set((state) => {
            const runtime = state.runtimesById[workerId];
            if (!runtime) {
                return state;
            }

            return {
                runtimesById: {
                    ...state.runtimesById,
                    [workerId]: {
                        ...runtime,
                        status: ThreadStreamStatus.STOPPING,
                        pendingStopCommandId: runtime.pendingStopCommandId ?? createCommandId(),
                        lastActiveAt: Date.now(),
                    },
                },
            };
        });
    },

    consumeQueuedCommand: (workerId: string, commandId: string) => {
        set((state) => {
            const runtime = state.runtimesById[workerId];
            if (!runtime || runtime.queuedCommands[0]?.id !== commandId) {
                return state;
            }

            return {
                runtimesById: {
                    ...state.runtimesById,
                    [workerId]: {
                        ...runtime,
                        queuedCommands: runtime.queuedCommands.slice(1),
                        lastActiveAt: Date.now(),
                    },
                },
            };
        });
    },

    consumeStopRequest: (workerId: string, commandId: string) => {
        set((state) => {
            const runtime = state.runtimesById[workerId];
            if (!runtime || runtime.pendingStopCommandId !== commandId) {
                return state;
            }

            return {
                runtimesById: {
                    ...state.runtimesById,
                    [workerId]: {
                        ...runtime,
                        pendingStopCommandId: null,
                        lastActiveAt: Date.now(),
                    },
                },
            };
        });
    },

    cancelQueuedCommand: (threadId: string | null, commandId: string) => {
        const threadKey = getThreadRuntimeKey(threadId);
        const workerId = get().runtimeIdByThreadKey[threadKey];
        if (!workerId) {
            return;
        }

        set((state) => {
            const runtime = state.runtimesById[workerId];
            if (!runtime) {
                return state;
            }

            const queuedCommands = runtime.queuedCommands.filter((command) => command.id !== commandId);
            if (queuedCommands.length === runtime.queuedCommands.length) {
                return state;
            }

            return {
                runtimesById: {
                    ...state.runtimesById,
                    [workerId]: {
                        ...runtime,
                        queuedCommands,
                        status:
                            runtime.status === ThreadStreamStatus.PENDING && queuedCommands.length === 0
                                ? ThreadStreamStatus.IDLE
                                : runtime.status,
                        lastActiveAt: Date.now(),
                    },
                },
            };
        });
    },

    clearQueuedCommands: (threadId: string | null) => {
        const threadKey = getThreadRuntimeKey(threadId);
        const workerId = get().runtimeIdByThreadKey[threadKey];
        if (!workerId) {
            return;
        }

        set((state) => {
            const runtime = state.runtimesById[workerId];
            if (!runtime || runtime.queuedCommands.length === 0) {
                return state;
            }

            return {
                runtimesById: {
                    ...state.runtimesById,
                    [workerId]: {
                        ...runtime,
                        queuedCommands: [],
                        status:
                            runtime.status === ThreadStreamStatus.PENDING
                                ? ThreadStreamStatus.IDLE
                                : runtime.status,
                        lastActiveAt: Date.now(),
                    },
                },
            };
        });
    },

    syncRuntimeLoading: (workerId: string, isLoading: boolean) => {
        set((state) => {
            const runtime = state.runtimesById[workerId];
            if (!runtime) {
                return state;
            }

            if (isLoading) {
                if (runtime.status === ThreadStreamStatus.STREAMING) {
                    return state;
                }

                return {
                    runtimesById: {
                        ...state.runtimesById,
                        [workerId]: {
                            ...runtime,
                            status: ThreadStreamStatus.STREAMING,
                            lastActiveAt: Date.now(),
                        },
                    },
                };
            }

            if (runtime.status !== ThreadStreamStatus.STREAMING && runtime.status !== ThreadStreamStatus.STOPPING) {
                return state;
            }

            return {
                runtimesById: {
                    ...state.runtimesById,
                    [workerId]: {
                        ...runtime,
                        status: runtime.queuedCommands.length > 0 ? ThreadStreamStatus.PENDING : ThreadStreamStatus.IDLE,
                        lastActiveAt: Date.now(),
                    },
                },
            };
        });
    },

    markRuntimeError: (workerId: string, error: string | null) => {
        set((state) => {
            const runtime = state.runtimesById[workerId];
            if (!runtime || runtime.lastError === error) {
                return state;
            }

            return {
                runtimesById: {
                    ...state.runtimesById,
                    [workerId]: {
                        ...runtime,
                        status:
                            runtime.queuedCommands.length > 0
                                ? ThreadStreamStatus.PENDING
                                : runtime.status === ThreadStreamStatus.PENDING
                                    || runtime.status === ThreadStreamStatus.STREAMING
                                    || runtime.status === ThreadStreamStatus.STOPPING
                                    ? ThreadStreamStatus.IDLE
                                    : runtime.status,
                        pendingStopCommandId: null,
                        lastError: error,
                        lastActiveAt: Date.now(),
                    },
                },
            };
        });
    },

    moveDraftRuntimeToThread: (threadId: string) => {
        const draftKey = getThreadRuntimeKey(null);
        const actualKey = getThreadRuntimeKey(threadId);

        set((state) => {
            const workerId = state.runtimeIdByThreadKey[draftKey];
            if (!workerId) {
                return state;
            }

            const runtime = state.runtimesById[workerId];
            if (!runtime) {
                return state;
            }

            const nextRuntimeIdByThreadKey = { ...state.runtimeIdByThreadKey };
            delete nextRuntimeIdByThreadKey[draftKey];
            nextRuntimeIdByThreadKey[actualKey] = workerId;

            return {
                runtimeIdByThreadKey: nextRuntimeIdByThreadKey,
                runtimesById: {
                    ...state.runtimesById,
                    [workerId]: {
                        ...runtime,
                        threadId,
                        lastActiveAt: Date.now(),
                    },
                },
            };
        });
    },

    clearThreadRuntime: (threadId: string | null) => {
        const threadKey = getThreadRuntimeKey(threadId);
        const workerId = get().runtimeIdByThreadKey[threadKey];
        if (!workerId) {
            return;
        }

        set((state) => removeRuntime(state, workerId));
    },

    clearRuntime: (workerId: string) => {
        set((state) => removeRuntime(state, workerId));
    },
}));

export function getThreadRuntimeSnapshot(state: Pick<StreamState, "runtimesById" | "runtimeIdByThreadKey">, threadId: string | null) {
    const runtimeId = state.runtimeIdByThreadKey[getThreadRuntimeKey(threadId)];
    return runtimeId ? state.runtimesById[runtimeId] ?? null : null;
}

export function getQueuedCommandsSnapshot(
    state: Pick<StreamState, "runtimesById" | "runtimeIdByThreadKey">,
    threadId: string | null,
) {
    return getThreadRuntimeSnapshot(state, threadId)?.queuedCommands ?? EMPTY_QUEUED_COMMANDS;
}

export function getActiveWorkerIdsSnapshot(state: Pick<StreamState, "runtimesById">) {
    return Object.values(state.runtimesById)
        .filter((runtime) => runtime.status !== ThreadStreamStatus.IDLE || runtime.queuedCommands.length > 0)
        .map((runtime) => runtime.workerId);
}

export function resetStreamStore() {
    useStreamStore.setState({
        nextRuntimeId: 1,
        runtimeIdByThreadKey: {},
        runtimesById: {},
    });
}
