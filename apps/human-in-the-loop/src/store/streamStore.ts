import { create } from "zustand";
import { DRAFT_THREAD_ID } from "../constants";
import type { HITLResponse } from "../types/interrupt";
import type { ThreadRuntime, ThreadStreamCommand } from "../types/stream";

let nextCommandId = 0;

interface StreamState {
    nextRuntimeId: number;
    runtimeIdByThreadKey: Record<string, string>;
    runtimesById: Record<string, ThreadRuntime>;
    enqueueMessage: (threadId: string | null, text: string, messageId: string) => void;
    enqueueReview: (threadId: string | null, response: HITLResponse) => void;
    stopThread: (threadId: string | null) => void;
    consumePendingCommand: (workerId: string, commandId: string) => void;
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
        status: "idle",
        pendingCommand: null,
        lastError: null,
        lastActiveAt: Date.now(),
    };
}

type ThreadStreamCommandInput =
    | { type: "submitMessage"; text: string; messageId: string }
    | { type: "submitReview"; response: HITLResponse }
    | { type: "stop" };

function createCommand(command: ThreadStreamCommandInput): ThreadStreamCommand {
    nextCommandId += 1;
    switch (command.type) {
        case "submitMessage":
            return {
                id: `cmd-${nextCommandId}`,
                type: "submitMessage",
                text: command.text,
                messageId: command.messageId,
            };
        case "submitReview":
            return {
                id: `cmd-${nextCommandId}`,
                type: "submitReview",
                response: command.response,
            };
        case "stop":
            return {
                id: `cmd-${nextCommandId}`,
                type: "stop",
            };
    }
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

    enqueueMessage: (threadId: string | null, text: string, messageId: string) => {
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
                    [workerId]: {
                        ...runtime,
                        threadId,
                        status: runtime.status === "streaming" ? "streaming" : "booting",
                        pendingCommand: createCommand({ type: "submitMessage", text, messageId }),
                        lastError: null,
                        lastActiveAt: Date.now(),
                    },
                },
            };
        });
    },

    enqueueReview: (threadId: string | null, response: HITLResponse) => {
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
                    [workerId]: {
                        ...runtime,
                        threadId,
                        status: runtime.status === "streaming" ? "streaming" : "booting",
                        pendingCommand: createCommand({ type: "submitReview", response }),
                        lastError: null,
                        lastActiveAt: Date.now(),
                    },
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
                        status: "stopping",
                        pendingCommand: createCommand({ type: "stop" }),
                        lastActiveAt: Date.now(),
                    },
                },
            };
        });
    },

    consumePendingCommand: (workerId: string, commandId: string) => {
        set((state) => {
            const runtime = state.runtimesById[workerId];
            if (!runtime || runtime.pendingCommand?.id !== commandId) {
                return state;
            }

            return {
                runtimesById: {
                    ...state.runtimesById,
                    [workerId]: {
                        ...runtime,
                        pendingCommand: null,
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
                if (runtime.status === "streaming") {
                    return state;
                }

                return {
                    runtimesById: {
                        ...state.runtimesById,
                        [workerId]: {
                            ...runtime,
                            status: "streaming",
                            lastActiveAt: Date.now(),
                        },
                    },
                };
            }

            if (runtime.status !== "streaming" && runtime.status !== "stopping") {
                return state;
            }

            return {
                runtimesById: {
                    ...state.runtimesById,
                    [workerId]: {
                        ...runtime,
                        status: "idle",
                        pendingCommand: null,
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
                        status: runtime.status === "booting" ? "idle" : runtime.status,
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

export function getActiveWorkerIdsSnapshot(state: Pick<StreamState, "runtimesById">) {
    return Object.values(state.runtimesById)
        .filter((runtime) => runtime.status !== "idle")
        .map((runtime) => runtime.workerId);
}

export function resetStreamStore() {
    useStreamStore.setState({
        nextRuntimeId: 1,
        runtimeIdByThreadKey: {},
        runtimesById: {},
    });
}
