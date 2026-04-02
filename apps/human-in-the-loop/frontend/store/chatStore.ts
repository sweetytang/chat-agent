/**
 * chatStore.ts — Chat 会话状态管理
 * 二期开始只负责“每个线程显示什么”，不再承担流运行时控制。
 */
import type { BaseMessage } from "@langchain/core/messages";
import { HumanMessage } from "@langchain/core/messages";
import type { ToolCallWithResult } from "@langchain/react";
import { create } from "zustand";
import { DRAFT_THREAD_ID } from "@common/constants";
import { fetchThreadSession } from "../services/chat/threadSession";
import type { ThreadSession } from "@frontend/types/chat";
import type { HITLRequest } from "@common/types/interrupt";

const EMPTY_THREAD_SESSION: ThreadSession = {
    messages: [],
    toolCalls: [],
    isLoading: false,
    interrupt: null,
    dismissedInterruptRequestId: null,
    hydrated: false,
    isHydrating: false,
};

interface ChatState {
    sessionsByThreadId: Record<string, ThreadSession>;
    ensureThreadSession: (threadId: string) => Promise<void>;
    clearThreadSession: (threadId: string | null) => void;
    moveDraftSessionToThread: (threadId: string) => void;
    prepareMessage: (threadId: string | null, text: string, messageId: string) => void;
    prepareReview: (threadId: string | null) => void;
}

function createEmptyThreadSession(): ThreadSession {
    return {
        ...EMPTY_THREAD_SESSION,
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
    return sessionsByThreadId[getThreadSessionKey(threadId)] ?? EMPTY_THREAD_SESSION;
}

export const useChatStore = create<ChatState>((set, get) => ({
    sessionsByThreadId: {},

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
            };
        });
    },

    prepareMessage: (threadId: string | null, text: string, messageId: string) => {
        const threadKey = getThreadSessionKey(threadId);
        const optimisticMessage = new HumanMessage({
            id: messageId,
            content: text,
        });

        set((state) => ({
            sessionsByThreadId: {
                ...state.sessionsByThreadId,
                [threadKey]: {
                    ...(state.sessionsByThreadId[threadKey] ?? createEmptyThreadSession()),
                    messages: [
                        ...((state.sessionsByThreadId[threadKey] ?? createEmptyThreadSession()).messages),
                        optimisticMessage,
                    ],
                    dismissedInterruptRequestId: null,
                    hydrated: true,
                    isHydrating: false,
                    isLoading: true,
                },
            },
        }));
    },

    prepareReview: (threadId: string | null) => {
        const threadKey = getThreadSessionKey(threadId);

        set((state) => {
            const currentSession = state.sessionsByThreadId[threadKey] ?? createEmptyThreadSession();

            return {
                sessionsByThreadId: {
                    ...state.sessionsByThreadId,
                    [threadKey]: {
                        ...currentSession,
                        dismissedInterruptRequestId: getInterruptRequestId(currentSession.interrupt),
                        hydrated: true,
                        isHydrating: false,
                        isLoading: true,
                    },
                },
            };
        });
    },
}));

export function getThreadSessionSnapshot(
    state: ChatState,
    threadId: string | null,
): ThreadSession {
    return getSessionOrEmpty(state.sessionsByThreadId, threadId);
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
        const shouldKeepPendingUiState =
            current.isLoading &&
            current.messages.length > 0 &&
            data.messages.length === 0 &&
            data.toolCalls.length === 0 &&
            data.interrupt === null;
        const nextInterruptRequestId = getInterruptRequestId(data.interrupt);
        const nextDismissedInterruptRequestId =
            nextInterruptRequestId && nextInterruptRequestId !== current.dismissedInterruptRequestId
                ? null
                : current.dismissedInterruptRequestId;
        const nextInterrupt =
            shouldKeepPendingUiState && current.interrupt
                ? current.interrupt
                : nextInterruptRequestId && nextInterruptRequestId === current.dismissedInterruptRequestId
                    ? null
                    : data.interrupt;

        const nextSession: ThreadSession = {
            ...current,
            messages: shouldKeepPendingUiState ? current.messages : data.messages,
            toolCalls: data.toolCalls,
            isLoading: shouldKeepPendingUiState ? current.isLoading : data.isLoading,
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

export function resetChatStore() {
    useChatStore.setState({
        sessionsByThreadId: {},
    });
}
