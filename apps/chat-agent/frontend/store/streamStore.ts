import { create } from "zustand";
import type { Checkpoint } from "@langchain/langgraph-sdk";
import type { HITLResponse } from "@common/types/interrupt";
import type { RunMetadata } from "@common/types/run";
import { ThreadRuntime, ThreadStreamCommand, ThreadStreamStatus } from "@frontend/types/stream";

let nextCommandId = 0;
const EMPTY_QUEUED_COMMANDS: ThreadStreamCommand[] = [];

interface StreamState {
    draftRuntime: ThreadRuntime | null;
    nextRuntimeId: number;
    runtimeIdByThreadKey: Record<string, string>;
    runtimesById: Record<string, ThreadRuntime>;
    enqueueMessage: (
        threadId: string | null,
        text: string,
        messageId: string,
        checkpoint?: Checkpoint | null,
        metadata?: RunMetadata,
    ) => void;
    enqueueRegenerate: (threadId: string | null, checkpoint: Checkpoint, metadata?: RunMetadata) => void;
    enqueueReview: (threadId: string | null, response: HITLResponse, metadata?: RunMetadata) => void;
    stopThread: (threadId: string | null) => void;
    consumeQueuedCommand: (workerId: string, commandId: string) => void;
    consumeStopRequest: (workerId: string, commandId: string) => void;
    clearQueuedCommands: (threadId: string | null) => void;
    syncRuntimeLoading: (workerId: string, isLoading: boolean) => void;
    markRuntimeError: (workerId: string) => void;
    moveDraftRuntimeToThread: (threadId: string) => void;
    clearThreadRuntime: (threadId: string | null) => void;
    clearRuntime: (workerId: string) => void;
}

function createRuntime(workerId: string, threadId: string | null): ThreadRuntime {
    return {
        workerId,
        threadId,
        status: ThreadStreamStatus.IDLE,
        queuedCommands: [],
        pendingStopCommandId: null,
        lastActiveAt: Date.now(),
    };
}

type ThreadStreamCommandInput =
    | { type: "submitMessage"; text: string; messageId: string; checkpoint: Checkpoint | null; metadata: RunMetadata }
    | { type: "regenerate"; checkpoint: Checkpoint; metadata: RunMetadata }
    | { type: "submitReview"; response: HITLResponse; metadata: RunMetadata };

function createCommandId() {
    nextCommandId += 1;
    return `cmd-${nextCommandId}`;
}

function createCommand(command: ThreadStreamCommandInput): ThreadStreamCommand {
    const id = createCommandId();

    switch (command.type) {
        case "submitMessage":
            return {
                id,
                type: "submitMessage",
                text: command.text,
                messageId: command.messageId,
                checkpoint: command.checkpoint,
                metadata: command.metadata,
            };
        case "regenerate":
            return {
                id,
                type: "regenerate",
                checkpoint: command.checkpoint,
                metadata: command.metadata,
            };
        case "submitReview":
            return {
                id,
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
        lastActiveAt: Date.now(),
    };
}

function getOrCreateRuntimeState(state: StreamState, threadId: string | null) {
    if (threadId === null) {
        if (state.draftRuntime) {
            return {
                workerId: state.draftRuntime.workerId,
                runtime: state.draftRuntime,
                nextRuntimeId: state.nextRuntimeId,
            };
        }

        const workerId = `runtime-${state.nextRuntimeId}`;
        return {
            workerId,
            runtime: createRuntime(workerId, null),
            nextRuntimeId: state.nextRuntimeId + 1,
        };
    }

    const existingWorkerId = state.runtimeIdByThreadKey[threadId];
    if (existingWorkerId) {
        return {
            workerId: existingWorkerId,
            runtime: state.runtimesById[existingWorkerId],
            nextRuntimeId: state.nextRuntimeId,
        };
    }

    const workerId = `runtime-${state.nextRuntimeId}`;
    return {
        workerId,
        runtime: createRuntime(workerId, threadId),
        nextRuntimeId: state.nextRuntimeId + 1,
    };
}

function getThreadRuntime(state: Pick<StreamState, "draftRuntime" | "runtimeIdByThreadKey" | "runtimesById">, threadId: string | null) {
    if (threadId === null) {
        return state.draftRuntime;
    }

    const runtimeId = state.runtimeIdByThreadKey[threadId];
    return runtimeId ? state.runtimesById[runtimeId] ?? null : null;
}

function getRuntimeByWorkerId(state: Pick<StreamState, "draftRuntime" | "runtimesById">, workerId: string) {
    if (state.draftRuntime?.workerId === workerId) {
        return state.draftRuntime;
    }

    return state.runtimesById[workerId] ?? null;
}

function writeThreadRuntime(
    state: Pick<StreamState, "draftRuntime" | "runtimeIdByThreadKey" | "runtimesById">,
    threadId: string | null,
    nextRuntime: ThreadRuntime | null,
) {
    if (threadId === null) {
        return {
            draftRuntime: nextRuntime,
            runtimeIdByThreadKey: state.runtimeIdByThreadKey,
            runtimesById: state.runtimesById,
        };
    }

    const nextRuntimeIdByThreadKey = { ...state.runtimeIdByThreadKey };
    const nextRuntimesById = { ...state.runtimesById };
    const previousRuntimeId = state.runtimeIdByThreadKey[threadId];

    if (nextRuntime) {
        nextRuntimeIdByThreadKey[threadId] = nextRuntime.workerId;
        nextRuntimesById[nextRuntime.workerId] = nextRuntime;
    } else {
        delete nextRuntimeIdByThreadKey[threadId];
        if (previousRuntimeId) {
            delete nextRuntimesById[previousRuntimeId];
        }
    }

    return {
        draftRuntime: state.draftRuntime,
        runtimeIdByThreadKey: nextRuntimeIdByThreadKey,
        runtimesById: nextRuntimesById,
    };
}

function writeRuntimeByWorkerId(
    state: Pick<StreamState, "draftRuntime" | "runtimeIdByThreadKey" | "runtimesById">,
    workerId: string,
    nextRuntime: ThreadRuntime | null,
) {
    if (state.draftRuntime?.workerId === workerId) {
        return {
            draftRuntime: nextRuntime,
            runtimeIdByThreadKey: state.runtimeIdByThreadKey,
            runtimesById: state.runtimesById,
        };
    }

    if (!(workerId in state.runtimesById) && nextRuntime === null) {
        return state;
    }

    const nextRuntimesById = { ...state.runtimesById };
    if (nextRuntime) {
        nextRuntimesById[workerId] = nextRuntime;
    } else {
        delete nextRuntimesById[workerId];
    }

    const nextRuntimeIdByThreadKey = { ...state.runtimeIdByThreadKey };
    Object.entries(nextRuntimeIdByThreadKey).forEach(([threadId, runtimeId]) => {
        if (runtimeId === workerId) {
            if (nextRuntime) {
                nextRuntimeIdByThreadKey[threadId] = nextRuntime.workerId;
            } else {
                delete nextRuntimeIdByThreadKey[threadId];
            }
        }
    });

    return {
        draftRuntime: state.draftRuntime,
        runtimesById: nextRuntimesById,
        runtimeIdByThreadKey: nextRuntimeIdByThreadKey,
    };
}

export const useStreamStore = create<StreamState>((set, get) => ({
    draftRuntime: null,
    nextRuntimeId: 1,
    runtimeIdByThreadKey: {},
    runtimesById: {},

    enqueueMessage: (
        threadId: string | null,
        text: string,
        messageId: string,
        checkpoint?: Checkpoint | null,
        metadata = {},
    ) => {
        if (!text.trim()) {
            return;
        }

        set((state) => {
            const { runtime, nextRuntimeId } = getOrCreateRuntimeState(state, threadId);
            const nextRuntime = appendQueuedCommand({ ...runtime, threadId }, {
                type: "submitMessage",
                text,
                messageId,
                checkpoint: checkpoint ?? null,
                metadata,
            });

            return {
                nextRuntimeId,
                ...writeThreadRuntime(state, threadId, nextRuntime),
            };
        });
    },

    enqueueRegenerate: (threadId: string | null, checkpoint: Checkpoint, metadata = {}) => {
        set((state) => {
            const { runtime, nextRuntimeId } = getOrCreateRuntimeState(state, threadId);
            const nextRuntime = appendQueuedCommand({ ...runtime, threadId }, {
                type: "regenerate",
                checkpoint,
                metadata,
            });

            return {
                nextRuntimeId,
                ...writeThreadRuntime(state, threadId, nextRuntime),
            };
        });
    },

    enqueueReview: (threadId: string | null, response: HITLResponse, metadata = {}) => {
        set((state) => {
            const { runtime, nextRuntimeId } = getOrCreateRuntimeState(state, threadId);
            const nextRuntime = appendQueuedCommand({ ...runtime, threadId }, {
                type: "submitReview",
                response,
                metadata,
            });

            return {
                nextRuntimeId,
                ...writeThreadRuntime(state, threadId, nextRuntime),
            };
        });
    },

    stopThread: (threadId: string | null) => {
        const runtime = getThreadRuntime(get(), threadId);
        if (!runtime) {
            return;
        }

        set((state) => {
            const currentRuntime = getRuntimeByWorkerId(state, runtime.workerId);
            if (!currentRuntime) {
                return state;
            }

            return writeRuntimeByWorkerId(state, runtime.workerId, {
                ...currentRuntime,
                status: ThreadStreamStatus.STOPPING,
                pendingStopCommandId: currentRuntime.pendingStopCommandId ?? createCommandId(),
                lastActiveAt: Date.now(),
            });
        });
    },

    consumeQueuedCommand: (workerId: string, commandId: string) => {
        set((state) => {
            const runtime = getRuntimeByWorkerId(state, workerId);
            if (!runtime || runtime.queuedCommands[0]?.id !== commandId) {
                return state;
            }

            return writeRuntimeByWorkerId(state, workerId, {
                ...runtime,
                queuedCommands: runtime.queuedCommands.slice(1),
                lastActiveAt: Date.now(),
            });
        });
    },

    consumeStopRequest: (workerId: string, commandId: string) => {
        set((state) => {
            const runtime = getRuntimeByWorkerId(state, workerId);
            if (!runtime || runtime.pendingStopCommandId !== commandId) {
                return state;
            }

            return writeRuntimeByWorkerId(state, workerId, {
                ...runtime,
                pendingStopCommandId: null,
                lastActiveAt: Date.now(),
            });
        });
    },

    clearQueuedCommands: (threadId: string | null) => {
        const runtime = getThreadRuntime(get(), threadId);
        if (!runtime) {
            return;
        }

        set((state) => {
            const currentRuntime = getRuntimeByWorkerId(state, runtime.workerId);
            if (!currentRuntime || currentRuntime.queuedCommands.length === 0) {
                return state;
            }

            return writeRuntimeByWorkerId(state, runtime.workerId, {
                ...currentRuntime,
                queuedCommands: [],
                status:
                    currentRuntime.status === ThreadStreamStatus.PENDING
                        ? ThreadStreamStatus.IDLE
                        : currentRuntime.status,
                lastActiveAt: Date.now(),
            });
        });
    },

    syncRuntimeLoading: (workerId: string, isLoading: boolean) => {
        set((state) => {
            const runtime = getRuntimeByWorkerId(state, workerId);
            if (!runtime) {
                return state;
            }

            if (isLoading) {
                if (runtime.status === ThreadStreamStatus.STREAMING) {
                    return state;
                }

                return writeRuntimeByWorkerId(state, workerId, {
                    ...runtime,
                    status: ThreadStreamStatus.STREAMING,
                    lastActiveAt: Date.now(),
                });
            }

            if (runtime.status !== ThreadStreamStatus.STREAMING && runtime.status !== ThreadStreamStatus.STOPPING) {
                return state;
            }

            return writeRuntimeByWorkerId(state, workerId, {
                ...runtime,
                status: runtime.queuedCommands.length > 0 ? ThreadStreamStatus.PENDING : ThreadStreamStatus.IDLE,
                lastActiveAt: Date.now(),
            });
        });
    },

    markRuntimeError: (workerId: string) => {
        set((state) => {
            const runtime = getRuntimeByWorkerId(state, workerId);
            if (!runtime) {
                return state;
            }

            return writeRuntimeByWorkerId(state, workerId, {
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
                lastActiveAt: Date.now(),
            });
        });
    },

    moveDraftRuntimeToThread: (threadId: string) => {
        set((state) => {
            if (!state.draftRuntime) {
                return state;
            }

            const nextRuntime = {
                ...state.draftRuntime,
                threadId,
                lastActiveAt: Date.now(),
            };

            return {
                draftRuntime: null,
                runtimeIdByThreadKey: {
                    ...state.runtimeIdByThreadKey,
                    [threadId]: nextRuntime.workerId,
                },
                runtimesById: {
                    ...state.runtimesById,
                    [nextRuntime.workerId]: nextRuntime,
                },
            };
        });
    },

    clearThreadRuntime: (threadId: string | null) => {
        const runtime = getThreadRuntime(get(), threadId);
        if (!runtime) {
            return;
        }

        set((state) => writeThreadRuntime(state, threadId, null));
    },

    clearRuntime: (workerId: string) => {
        set((state) => writeRuntimeByWorkerId(state, workerId, null));
    },
}));

export function getThreadRuntimeSnapshot(
    state: Pick<StreamState, "draftRuntime" | "runtimesById" | "runtimeIdByThreadKey">,
    threadId: string | null,
) {
    return getThreadRuntime(state, threadId);
}

export function getWorkerRuntimeSnapshot(
    state: Pick<StreamState, "draftRuntime" | "runtimesById">,
    workerId: string,
) {
    return getRuntimeByWorkerId(state, workerId);
}

export function getQueuedCommandsSnapshot(
    state: Pick<StreamState, "draftRuntime" | "runtimesById" | "runtimeIdByThreadKey">,
    threadId: string | null,
) {
    return getThreadRuntimeSnapshot(state, threadId)?.queuedCommands ?? EMPTY_QUEUED_COMMANDS;
}

export function getActiveWorkerIdsSnapshot(state: Pick<StreamState, "draftRuntime" | "runtimesById">) {
    const runtimes = state.draftRuntime
        ? [state.draftRuntime, ...Object.values(state.runtimesById)]
        : Object.values(state.runtimesById);

    return runtimes
        .filter((runtime) => runtime.status !== ThreadStreamStatus.IDLE || runtime.queuedCommands.length > 0)
        .map((runtime) => runtime.workerId);
}

export function resetStreamStore() {
    useStreamStore.setState({
        draftRuntime: null,
        nextRuntimeId: 1,
        runtimeIdByThreadKey: {},
        runtimesById: {},
    });
}
