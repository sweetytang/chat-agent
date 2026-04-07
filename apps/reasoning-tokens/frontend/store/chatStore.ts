/**
 * chatStore.ts — Chat 会话状态管理
 * 负责线程消息视图、分支视图和流式运行结果的落盘同步。
 */
import type { BaseMessage } from "@langchain/core/messages";
import { HumanMessage } from "@langchain/core/messages";
import type { ToolCallWithResult } from "@langchain/react";
import { create } from "zustand";
import { DRAFT_THREAD_ID } from "@common/constants";
import type { ThreadCheckpoint } from "@common/types/thread";
import { buildBranchingSessionData, sortHistoryChronologically } from "@frontend/services/chat/branching";
import { fetchThreadSession } from "../services/chat/threadSession";
import type { ThreadHistoryState, ThreadMessageBranchMetadata, ThreadSession } from "@frontend/types/chat";
import type { HITLRequest } from "@common/types/interrupt";

const EMPTY_THREAD_SESSION: ThreadSession = {
    messages: [],
    toolCalls: [],
    isLoading: false,
    interrupt: null,
    dismissedInterruptRequestId: null,
    hydrated: false,
    isHydrating: false,
    history: [],
    activeBranch: "",
    headCheckpoint: null,
    messageMetadataById: {},
};

interface ChatState {
    sessionsByThreadId: Record<string, ThreadSession>;
    ensureThreadSession: (threadId: string) => Promise<void>;
    refreshThreadSession: (threadId: string, preferredBranch?: string) => Promise<void>;
    clearThreadSession: (threadId: string | null) => void;
    moveDraftSessionToThread: (threadId: string) => void;
    prepareMessage: (
        threadId: string | null,
        text: string,
        messageId: string,
    ) => void;
    prepareBranchRun: (
        threadId: string | null,
        optimisticState?: Partial<Pick<ThreadSession, "messages" | "toolCalls" | "interrupt" | "activeBranch" | "headCheckpoint" | "messageMetadataById">>,
    ) => void;
    prepareReview: (threadId: string | null) => void;
    selectBranch: (threadId: string | null, branch: string) => void;
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

function toComparableContent(value: unknown): string {
    return JSON.stringify(value ?? null);
}

function areMessagesEqual(prev: BaseMessage[], next: BaseMessage[]): boolean {
    if (prev === next) {
        return true;
    }

    if (prev.length !== next.length) {
        return false;
    }

    return prev.every((message, index) => {
        const nextMessage = next[index] as any;
        const currentMessage = message as any;

        return (message.id ?? null) === (nextMessage?.id ?? null)
            && (currentMessage?._getType?.() ?? currentMessage?.type ?? null)
            === (nextMessage?._getType?.() ?? nextMessage?.type ?? null)
            && toComparableContent(currentMessage?.content) === toComparableContent(nextMessage?.content)
            && toComparableContent(currentMessage?.tool_calls) === toComparableContent(nextMessage?.tool_calls)
            && toComparableContent(currentMessage?.tool_call_id) === toComparableContent(nextMessage?.tool_call_id);
    });
}

function areToolCallsEqual(prev: ToolCallWithResult[], next: ToolCallWithResult[]): boolean {
    if (prev === next) {
        return true;
    }

    if (prev.length !== next.length) {
        return false;
    }

    return prev.every((toolCall, index) => {
        const nextToolCall = next[index] as any;
        const currentToolCall = toolCall as any;

        return toComparableContent(currentToolCall?.call) === toComparableContent(nextToolCall?.call)
            && toComparableContent(currentToolCall?.result?.content ?? currentToolCall?.result) === toComparableContent(nextToolCall?.result?.content ?? nextToolCall?.result)
            && toComparableContent(currentToolCall?.state) === toComparableContent(nextToolCall?.state);
    });
}

function areCheckpointsEqual(
    prev: ThreadCheckpoint | null,
    next: ThreadCheckpoint | null,
): boolean {
    return (prev?.checkpoint_id ?? null) === (next?.checkpoint_id ?? null);
}

function areHistoriesEqual(prev: ThreadHistoryState[], next: ThreadHistoryState[]): boolean {
    if (prev === next) {
        return true;
    }

    if (prev.length !== next.length) {
        return false;
    }

    return prev.every((state, index) => {
        const nextState = next[index];
        return areCheckpointsEqual(state.checkpoint, nextState?.checkpoint ?? null)
            && areCheckpointsEqual(state.parent_checkpoint, nextState?.parent_checkpoint ?? null)
            && state.created_at === nextState?.created_at;
    });
}

function areMessageMetadataMapsEqual(
    prev: Record<string, ThreadMessageBranchMetadata>,
    next: Record<string, ThreadMessageBranchMetadata>,
): boolean {
    if (prev === next) {
        return true;
    }

    const prevKeys = Object.keys(prev);
    const nextKeys = Object.keys(next);

    if (prevKeys.length !== nextKeys.length) {
        return false;
    }

    return prevKeys.every((key) => {
        const prevItem = prev[key];
        const nextItem = next[key];

        if (!nextItem) {
            return false;
        }

        return prevItem.messageId === nextItem.messageId
            && prevItem.branch === nextItem.branch
            && toComparableContent(prevItem.branchOptions) === toComparableContent(nextItem.branchOptions)
            && (prevItem.firstSeenState?.checkpoint?.checkpoint_id ?? null)
            === (nextItem.firstSeenState?.checkpoint?.checkpoint_id ?? null);
    });
}

function areInterruptsEqual(
    prev: { value: HITLRequest } | null,
    next: { value: HITLRequest } | null,
): boolean {
    return getInterruptRequestId(prev) === getInterruptRequestId(next)
        && toComparableContent(prev?.value) === toComparableContent(next?.value);
}

function applyBranchSelection(session: ThreadSession, branch: string): ThreadSession {
    const branchingSession = buildBranchingSessionData(session.history, branch);
    const nextInterrupt = branchingSession.interrupt;
    const nextInterruptRequestId = getInterruptRequestId(nextInterrupt);

    return {
        ...session,
        messages: branchingSession.messages,
        activeBranch: branchingSession.activeBranch,
        headCheckpoint: branchingSession.headCheckpoint,
        messageMetadataById: branchingSession.messageMetadataById,
        interrupt: nextInterrupt,
        dismissedInterruptRequestId:
            nextInterruptRequestId &&
            nextInterruptRequestId !== session.dismissedInterruptRequestId
                ? null
                : session.dismissedInterruptRequestId,
    };
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

    refreshThreadSession: async (threadId: string, preferredBranch) => {
        const threadKey = getThreadSessionKey(threadId);

        try {
            const currentBranch = get().sessionsByThreadId[threadKey]?.activeBranch ?? "";
            const hydratedSession = await fetchThreadSession(threadId, preferredBranch ?? currentBranch);
            set((state) => {
                const current = state.sessionsByThreadId[threadKey] ?? createEmptyThreadSession();
                const nextInterruptRequestId = getInterruptRequestId(hydratedSession.interrupt);

                return {
                    sessionsByThreadId: {
                        ...state.sessionsByThreadId,
                        [threadKey]: {
                            ...current,
                            ...hydratedSession,
                            dismissedInterruptRequestId:
                                nextInterruptRequestId &&
                                nextInterruptRequestId !== current.dismissedInterruptRequestId
                                    ? null
                                    : current.dismissedInterruptRequestId,
                        },
                    },
                };
            });
        } catch (error) {
            console.error(`Failed to refresh thread session ${threadId}`, error);
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

    prepareBranchRun: (threadId: string | null, optimisticState) => {
        const threadKey = getThreadSessionKey(threadId);

        set((state) => {
            const currentSession = state.sessionsByThreadId[threadKey] ?? createEmptyThreadSession();

            return {
                sessionsByThreadId: {
                    ...state.sessionsByThreadId,
                    [threadKey]: {
                        ...currentSession,
                        messages: optimisticState?.messages ?? currentSession.messages,
                        toolCalls: optimisticState?.toolCalls ?? currentSession.toolCalls,
                        interrupt: optimisticState?.interrupt ?? null,
                        activeBranch: optimisticState?.activeBranch ?? currentSession.activeBranch,
                        headCheckpoint: optimisticState?.headCheckpoint ?? currentSession.headCheckpoint,
                        messageMetadataById: optimisticState?.messageMetadataById ?? currentSession.messageMetadataById,
                        dismissedInterruptRequestId: null,
                        hydrated: true,
                        isHydrating: false,
                        isLoading: true,
                    },
                },
            };
        });
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

    selectBranch: (threadId: string | null, branch: string) => {
        const threadKey = getThreadSessionKey(threadId);

        set((state) => {
            const currentSession = state.sessionsByThreadId[threadKey];
            if (!currentSession || currentSession.history.length === 0) {
                return state;
            }

            return {
                sessionsByThreadId: {
                    ...state.sessionsByThreadId,
                    [threadKey]: applyBranchSelection(currentSession, branch),
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
        history?: ThreadHistoryState[];
        activeBranch?: string;
        headCheckpoint?: ThreadCheckpoint | null;
        messageMetadataById?: Record<string, ThreadMessageBranchMetadata>;
    },
) {
    const threadKey = getThreadSessionKey(threadId);

    useChatStore.setState((state) => {
        const current = state.sessionsByThreadId[threadKey] ?? createEmptyThreadSession();
        const nextHistory = data.history
            ? sortHistoryChronologically(data.history)
            : current.history;
        const branchingSession = data.history
            ? buildBranchingSessionData(nextHistory, data.activeBranch ?? current.activeBranch)
            : null;
        const shouldKeepPendingUiState =
            current.isLoading &&
            current.messages.length > 0 &&
            data.messages.length === 0 &&
            data.toolCalls.length === 0 &&
            data.interrupt === null;
        const resolvedInterrupt = branchingSession?.interrupt ?? data.interrupt;
        const nextInterruptRequestId = getInterruptRequestId(resolvedInterrupt);
        const nextDismissedInterruptRequestId =
            nextInterruptRequestId && nextInterruptRequestId !== current.dismissedInterruptRequestId
                ? null
                : current.dismissedInterruptRequestId;
        const nextInterrupt =
            shouldKeepPendingUiState && current.interrupt
                ? current.interrupt
                : nextInterruptRequestId && nextInterruptRequestId === current.dismissedInterruptRequestId
                    ? null
                    : resolvedInterrupt;

        const nextMessages =
            shouldKeepPendingUiState
                ? current.messages
                : data.messages.length > 0 || data.isLoading
                    ? data.messages
                    : branchingSession?.messages ?? current.messages;
        const nextSession: ThreadSession = {
            ...current,
            messages: nextMessages,
            toolCalls: data.toolCalls,
            isLoading: data.isLoading,
            interrupt: nextInterrupt,
            dismissedInterruptRequestId: nextDismissedInterruptRequestId,
            hydrated: true,
            isHydrating: false,
            history: nextHistory,
            activeBranch: branchingSession?.activeBranch ?? data.activeBranch ?? current.activeBranch,
            headCheckpoint: data.headCheckpoint ?? branchingSession?.headCheckpoint ?? current.headCheckpoint,
            messageMetadataById: data.messageMetadataById
                ?? branchingSession?.messageMetadataById
                ?? current.messageMetadataById,
        };

        if (
            areMessagesEqual(current.messages, nextSession.messages) &&
            areToolCallsEqual(current.toolCalls, nextSession.toolCalls) &&
            current.isLoading === nextSession.isLoading &&
            areInterruptsEqual(current.interrupt, nextSession.interrupt) &&
            current.dismissedInterruptRequestId === nextSession.dismissedInterruptRequestId &&
            current.hydrated === nextSession.hydrated &&
            current.isHydrating === nextSession.isHydrating &&
            areHistoriesEqual(current.history, nextSession.history) &&
            current.activeBranch === nextSession.activeBranch &&
            areCheckpointsEqual(current.headCheckpoint, nextSession.headCheckpoint) &&
            areMessageMetadataMapsEqual(current.messageMetadataById, nextSession.messageMetadataById)
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
