/**
 * chatStore.ts — Chat 会话状态管理
 * 一期将聊天状态改为按线程缓存，拆开“当前正在看哪个线程”和“当前流绑定哪个线程”。
 */
import type { BaseMessage } from "@langchain/core/messages";
import type { ToolCallWithResult } from "@langchain/react";
import { create } from "zustand";
import { fetchThreadSession } from "../services/chat/threadSession";
import type { ThreadSession } from "../types/chat";
import type { HITLRequest, HITLResponse } from "../types/interrupt";

const DRAFT_THREAD_ID = "__draft__";
const EMPTY_THREAD_SESSION: ThreadSession = {
    messages: [],
    toolCalls: [],
    isLoading: false,
    interrupt: null,
    dismissedInterruptRequestId: null,
    hydrated: false,
    isHydrating: false,
};

let submitRef: ((input: any, options?: any) => void) | null = null;
let stopRef: (() => void) | null = null;

type PendingStreamCommand =
    | { type: "submitMessage"; threadId: string | null; text: string }
    | { type: "submitReview"; threadId: string | null; response: HITLResponse };

interface ChatState {
    sessionsByThreadId: Record<string, ThreadSession>;
    streamThreadId: string | null;
    pendingStreamCommand: PendingStreamCommand | null;
    ensureThreadSession: (threadId: string) => Promise<void>;
    clearThreadSession: (threadId: string | null) => void;
    moveDraftSessionToThread: (threadId: string) => void;
    submitMessage: (threadId: string | null, text: string) => void;
    stopMessage: (threadId: string | null) => void;
    submitReview: (threadId: string | null, response: HITLResponse) => void;
    clearPendingStreamCommand: () => void;
}

function createEmptyThreadSession(): ThreadSession {
    return {
        ...EMPTY_THREAD_SESSION,
        messages: [],
        toolCalls: [],
    };
}

function getThreadSessionKey(threadId: string | null): string {
    return threadId ?? DRAFT_THREAD_ID;
}

function getInterruptRequestId(interrupt: { value: HITLRequest } | null): string | null {
    return interrupt?.value?.requestId ?? null;
}

function getSessionOrEmpty(
    sessionsByThreadId: Record<string, ThreadSession>,
    threadId: string | null,
): ThreadSession {
    return sessionsByThreadId[getThreadSessionKey(threadId)] ?? createEmptyThreadSession();
}

export const useChatStore = create<ChatState>((set, get) => ({
    sessionsByThreadId: {},
    streamThreadId: null,
    pendingStreamCommand: null,

    ensureThreadSession: async (threadId: string) => {
        const threadKey = getThreadSessionKey(threadId);
        const existing = get().sessionsByThreadId[threadKey];
        if (existing?.hydrated || existing?.isHydrating || existing?.isLoading) {
            return;
        }

        set((state) => ({
            sessionsByThreadId: {
                ...state.sessionsByThreadId,
                [threadKey]: {
                    ...(state.sessionsByThreadId[threadKey] ?? createEmptyThreadSession()),
                    isHydrating: true,
                },
            },
        }));

        try {
            const hydratedSession = await fetchThreadSession(threadId);
            set((state) => {
                const current = state.sessionsByThreadId[threadKey] ?? createEmptyThreadSession();
                if (current.isLoading || current.hydrated) {
                    return {
                        sessionsByThreadId: {
                            ...state.sessionsByThreadId,
                            [threadKey]: {
                                ...current,
                                isHydrating: false,
                            },
                        },
                    };
                }

                return {
                    sessionsByThreadId: {
                        ...state.sessionsByThreadId,
                        [threadKey]: {
                            ...current,
                            ...hydratedSession,
                        },
                    },
                };
            });
        } catch (error) {
            console.error(`Failed to hydrate thread session ${threadId}`, error);
            set((state) => ({
                sessionsByThreadId: {
                    ...state.sessionsByThreadId,
                    [threadKey]: {
                        ...(state.sessionsByThreadId[threadKey] ?? createEmptyThreadSession()),
                        isHydrating: false,
                    },
                },
            }));
        }
    },

    clearThreadSession: (threadId: string | null) => {
        const threadKey = getThreadSessionKey(threadId);
        set((state) => {
            if (!(threadKey in state.sessionsByThreadId)) {
                return state;
            }

            const nextSessions = { ...state.sessionsByThreadId };
            delete nextSessions[threadKey];

            return {
                sessionsByThreadId: nextSessions,
                streamThreadId: state.streamThreadId === threadId ? null : state.streamThreadId,
                pendingStreamCommand:
                    state.pendingStreamCommand?.threadId === threadId
                        ? null
                        : state.pendingStreamCommand,
            };
        });
    },

    moveDraftSessionToThread: (threadId: string) => {
        const draftKey = getThreadSessionKey(null);
        const actualThreadKey = getThreadSessionKey(threadId);

        set((state) => {
            const draftSession = state.sessionsByThreadId[draftKey];
            const existingSession =
                state.sessionsByThreadId[actualThreadKey] ?? createEmptyThreadSession();
            const nextSessions = { ...state.sessionsByThreadId };

            if (draftSession) {
                delete nextSessions[draftKey];
            }

            nextSessions[actualThreadKey] = draftSession
                ? {
                    ...existingSession,
                    ...draftSession,
                    hydrated: true,
                    isHydrating: false,
                }
                : {
                    ...existingSession,
                    hydrated: true,
                };

            return {
                sessionsByThreadId: nextSessions,
                streamThreadId: threadId,
                pendingStreamCommand: null,
            };
        });
    },

    submitMessage: (threadId: string | null, text: string) => {
        if (!text.trim()) {
            return;
        }

        const state = get();
        const currentStreamSession = getSessionOrEmpty(state.sessionsByThreadId, state.streamThreadId);
        const hasForeignActiveStream =
            state.streamThreadId !== null &&
            state.streamThreadId !== threadId &&
            currentStreamSession.isLoading;
        if (hasForeignActiveStream) {
            return;
        }

        const threadKey = getThreadSessionKey(threadId);
        set((currentState) => ({
            sessionsByThreadId: {
                ...currentState.sessionsByThreadId,
                [threadKey]: {
                    ...(currentState.sessionsByThreadId[threadKey] ?? createEmptyThreadSession()),
                    dismissedInterruptRequestId: null,
                },
            },
            streamThreadId: threadId,
            pendingStreamCommand:
                state.streamThreadId !== threadId
                    ? { type: "submitMessage", threadId, text }
                    : null,
        }));

        if (state.streamThreadId !== threadId) {
            return;
        }

        submitRef?.({ messages: [{ type: "human", content: text }] });
    },

    stopMessage: (threadId: string | null) => {
        if (threadId !== get().streamThreadId) {
            return;
        }

        stopRef?.();
    },

    submitReview: (threadId: string | null, response: HITLResponse) => {
        const state = get();
        const currentStreamSession = getSessionOrEmpty(state.sessionsByThreadId, state.streamThreadId);
        const hasForeignActiveStream =
            state.streamThreadId !== null &&
            state.streamThreadId !== threadId &&
            currentStreamSession.isLoading;
        if (hasForeignActiveStream) {
            return;
        }

        const threadKey = getThreadSessionKey(threadId);
        const currentSession = state.sessionsByThreadId[threadKey] ?? createEmptyThreadSession();
        set((currentState) => ({
            sessionsByThreadId: {
                ...currentState.sessionsByThreadId,
                [threadKey]: {
                    ...currentSession,
                    dismissedInterruptRequestId: getInterruptRequestId(currentSession.interrupt),
                    interrupt: null,
                    isLoading: true,
                },
            },
            streamThreadId: threadId,
            pendingStreamCommand:
                state.streamThreadId !== threadId
                    ? { type: "submitReview", threadId, response }
                    : null,
        }));

        if (state.streamThreadId !== threadId) {
            return;
        }

        submitRef?.(null, { command: { resume: response } });
    },

    clearPendingStreamCommand: () => {
        set({ pendingStreamCommand: null });
    },
}));

export function getThreadSessionSnapshot(
    state: ChatState,
    threadId: string | null,
): ThreadSession {
    return getSessionOrEmpty(state.sessionsByThreadId, threadId);
}

export function getHasForeignActiveStreamSnapshot(
    state: ChatState,
    threadId: string | null,
) {
    const currentStreamSession = getSessionOrEmpty(state.sessionsByThreadId, state.streamThreadId);
    return (
        state.streamThreadId !== null &&
        state.streamThreadId !== threadId &&
        currentStreamSession.isLoading
    );
}




export function syncStreamData(
    threadId: string | null,
    data: {
        messages: BaseMessage[];
        toolCalls: ToolCallWithResult[];
        isLoading: boolean;
        interrupt: { value: HITLRequest } | null;
    },
) {
    const threadKey = getThreadSessionKey(threadId);

    useChatStore.setState((state) => {
        const current = state.sessionsByThreadId[threadKey] ?? createEmptyThreadSession();
        const nextInterruptRequestId = getInterruptRequestId(data.interrupt);
        const nextDismissedInterruptRequestId =
            nextInterruptRequestId && nextInterruptRequestId !== current.dismissedInterruptRequestId
                ? null
                : current.dismissedInterruptRequestId;
        const nextInterrupt =
            nextInterruptRequestId && nextInterruptRequestId === current.dismissedInterruptRequestId
                ? null
                : data.interrupt;

        const nextSession: ThreadSession = {
            ...current,
            messages: data.messages,
            toolCalls: data.toolCalls,
            isLoading: data.isLoading,
            interrupt: nextInterrupt,
            dismissedInterruptRequestId: nextDismissedInterruptRequestId,
            hydrated: true,
            isHydrating: false,
        };

        if (
            current.messages === nextSession.messages &&
            current.toolCalls === nextSession.toolCalls &&
            current.isLoading === nextSession.isLoading &&
            current.interrupt === nextSession.interrupt &&
            current.dismissedInterruptRequestId === nextSession.dismissedInterruptRequestId &&
            current.hydrated === nextSession.hydrated &&
            current.isHydrating === nextSession.isHydrating
        ) {
            return state;
        }

        return {
            sessionsByThreadId: {
                ...state.sessionsByThreadId,
                [threadKey]: nextSession,
            },
        };
    });
}




export function syncStreamActions(actions: {
    submit: (input: any, options?: any) => void;
    stop: () => void;
}) {
    submitRef = actions.submit;
    stopRef = actions.stop;
}

export function resetChatStore() {
    submitRef = null;
    stopRef = null;
    useChatStore.setState({
        sessionsByThreadId: {},
        streamThreadId: null,
        pendingStreamCommand: null,
    });
}
