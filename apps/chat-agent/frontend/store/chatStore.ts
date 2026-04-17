/**
 * chatStore.ts — Chat 会话状态管理
 * 负责线程消息视图、分支视图和流式运行结果的落盘同步。
 */
import type { BaseMessage } from "@langchain/core/messages";
import { HumanMessage } from "@langchain/core/messages";
import type { ToolCallWithResult } from "@langchain/react";
import { create } from "zustand";
import type { Checkpoint, Interrupt } from "@langchain/langgraph-sdk";
import { buildBranchingSessionData } from "@frontend/services/chat/branching";
import type { HITLRequest } from "@common/types/interrupt";
import { fetchThreadSession } from "../services/chat/threadSession";
import type { ThreadStateSnapshot, ThreadMessageBranchMetadata, ThreadSession } from "@frontend/types/chat";

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
    draftSession: ThreadSession | null;
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

function getInterruptRequestId(interrupt: Interrupt<HITLRequest> | null | undefined): string {
    return interrupt?.value?.requestId ?? '';
}

function getStoredSession(
    state: Pick<ChatState, "draftSession" | "sessionsByThreadId">,
    threadId: string | null,
): ThreadSession | null {
    if (threadId === null) {
        return state.draftSession;
    }

    return state.sessionsByThreadId[threadId] ?? null;
}

function writeStoredSession(
    state: Pick<ChatState, "draftSession" | "sessionsByThreadId">,
    threadId: string | null,
    nextSession: ThreadSession | null,
) {
    if (threadId === null) {
        return {
            draftSession: nextSession,
            sessionsByThreadId: state.sessionsByThreadId,
        };
    }

    const nextSessions = { ...state.sessionsByThreadId };
    if (nextSession) {
        nextSessions[threadId] = nextSession;
    } else {
        delete nextSessions[threadId];
    }

    return {
        draftSession: state.draftSession,
        sessionsByThreadId: nextSessions,
    };
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
            && toComparableContent(currentMessage?.additional_kwargs) === toComparableContent(nextMessage?.additional_kwargs)
            && toComparableContent(currentMessage?.response_metadata) === toComparableContent(nextMessage?.response_metadata)
            && toComparableContent(currentMessage?.usage_metadata) === toComparableContent(nextMessage?.usage_metadata)
            && toComparableContent(currentMessage?.tool_calls) === toComparableContent(nextMessage?.tool_calls)
            && toComparableContent(currentMessage?.tool_call_id) === toComparableContent(nextMessage?.tool_call_id)
            && toComparableContent(currentMessage?.invalid_tool_calls) === toComparableContent(nextMessage?.invalid_tool_calls);
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
    prev: Checkpoint | null | undefined,
    next: Checkpoint | null | undefined,
): boolean {
    return (prev?.checkpoint_id ?? null) === (next?.checkpoint_id ?? null);
}

function areHistoriesEqual(prev: ThreadStateSnapshot[], next: ThreadStateSnapshot[]): boolean {
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
    prev: Interrupt<HITLRequest> | null | undefined,
    next: Interrupt<HITLRequest> | null | undefined,
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
        ...branchingSession,
        interrupt: nextInterrupt,
        dismissedInterruptRequestId:
            nextInterruptRequestId &&
                nextInterruptRequestId !== session.dismissedInterruptRequestId
                ? null
                : session.dismissedInterruptRequestId,
    };
}

export const useChatStore = create<ChatState>((set, get) => ({
    draftSession: null,
    sessionsByThreadId: {},

    ensureThreadSession: async (threadId: string) => {
        const existing = get().sessionsByThreadId[threadId];
        if (existing?.hydrated || existing?.isHydrating || existing?.isLoading) {
            return;
        }

        set((state) => ({
            sessionsByThreadId: {
                ...state.sessionsByThreadId,
                [threadId]: {
                    ...(state.sessionsByThreadId[threadId] ?? createEmptyThreadSession()),
                    isHydrating: true,
                },
            },
        }));

        try {
            const hydratedSession = await fetchThreadSession(threadId);
            set((state) => {
                const current = state.sessionsByThreadId[threadId] ?? createEmptyThreadSession();
                if (current.isLoading || current.hydrated) {
                    return {
                        sessionsByThreadId: {
                            ...state.sessionsByThreadId,
                            [threadId]: {
                                ...current,
                                isHydrating: false,
                            },
                        },
                    };
                }

                return {
                    sessionsByThreadId: {
                        ...state.sessionsByThreadId,
                        [threadId]: {
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
                    [threadId]: {
                        ...(state.sessionsByThreadId[threadId] ?? createEmptyThreadSession()),
                        isHydrating: false,
                    },
                },
            }));
        }
    },

    refreshThreadSession: async (threadId: string, preferredBranch) => {
        try {
            const currentBranch = get().sessionsByThreadId[threadId]?.activeBranch ?? "";
            const hydratedSession = await fetchThreadSession(threadId, preferredBranch ?? currentBranch);
            set((state) => {
                const current = state.sessionsByThreadId[threadId] ?? createEmptyThreadSession();
                const nextInterruptRequestId = getInterruptRequestId(hydratedSession.interrupt);

                return {
                    sessionsByThreadId: {
                        ...state.sessionsByThreadId,
                        [threadId]: {
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
        set((state) => {
            if (!getStoredSession(state, threadId)) {
                return state;
            }

            return writeStoredSession(state, threadId, null);
        });
    },

    moveDraftSessionToThread: (threadId: string) => {
        set((state) => {
            const draftSession = state.draftSession;
            const existingSession =
                state.sessionsByThreadId[threadId] ?? createEmptyThreadSession();
            const nextSession = draftSession
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
                draftSession: null,
                sessionsByThreadId: {
                    ...state.sessionsByThreadId,
                    [threadId]: nextSession,
                },
            };
        });
    },

    prepareMessage: (threadId: string | null, text: string, messageId: string) => {
        const optimisticMessage = new HumanMessage({
            id: messageId,
            content: text,
        });

        set((state) => {
            const currentSession = getStoredSession(state, threadId) ?? createEmptyThreadSession();

            return writeStoredSession(state, threadId, {
                ...currentSession,
                messages: [...currentSession.messages, optimisticMessage],
                dismissedInterruptRequestId: null,
                hydrated: true,
                isHydrating: false,
                isLoading: true,
            });
        });
    },

    prepareBranchRun: (threadId: string | null, optimisticState) => {
        set((state) => {
            const currentSession = getStoredSession(state, threadId) ?? createEmptyThreadSession();

            return writeStoredSession(state, threadId, {
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
            });
        });
    },

    prepareReview: (threadId: string | null) => {
        set((state) => {
            const currentSession = getStoredSession(state, threadId) ?? createEmptyThreadSession();

            return writeStoredSession(state, threadId, {
                ...currentSession,
                dismissedInterruptRequestId: getInterruptRequestId(currentSession.interrupt),
                hydrated: true,
                isHydrating: false,
                isLoading: true,
            });
        });
    },

    selectBranch: (threadId: string | null, branch: string) => {
        set((state) => {
            const currentSession = getStoredSession(state, threadId);
            if (!currentSession || currentSession.history.length === 0) {
                return state;
            }

            return writeStoredSession(state, threadId, applyBranchSelection(currentSession, branch));
        });
    },
}));

export function getThreadSessionSnapshot(
    state: ChatState,
    threadId: string | null,
): ThreadSession {
    return getStoredSession(state, threadId) ?? EMPTY_THREAD_SESSION;
}






// 同步useStream数据至zustand全局状态
export function syncStreamData(
    threadId: string | null,
    data: {
        messages: BaseMessage[];
        toolCalls: ToolCallWithResult[];
        isLoading: boolean;
        interrupt: Interrupt<HITLRequest> | null;
        history?: ThreadStateSnapshot[];
        activeBranch?: string;
        headCheckpoint?: Checkpoint | null;
        messageMetadataById?: Record<string, ThreadMessageBranchMetadata>;
    },
) {
    useChatStore.setState((state) => {
        const current = getStoredSession(state, threadId) ?? createEmptyThreadSession();
        const nextHistory = data.history || current.history;
        const fallbackBranchingSession = data.history
            && (
                data.activeBranch === undefined
                || data.headCheckpoint === undefined
                || data.messageMetadataById === undefined
            )
            ? buildBranchingSessionData(nextHistory, data.activeBranch ?? current.activeBranch)
            : null;
        const shouldKeepPendingUiState =
            current.isLoading &&
            current.messages.length > 0 &&
            data.messages.length === 0 &&
            data.toolCalls.length === 0 &&
            data.interrupt === null;
        const resolvedInterrupt = data.interrupt ?? fallbackBranchingSession?.interrupt ?? null;
        const nextInterruptRequestId = getInterruptRequestId(resolvedInterrupt);
        const nextDismissedInterruptRequestId =
            nextInterruptRequestId && nextInterruptRequestId !== current.dismissedInterruptRequestId
                ? null
                : current.dismissedInterruptRequestId;
        const nextInterrupt =
            shouldKeepPendingUiState
                && current.interrupt
                && getInterruptRequestId(current.interrupt) !== current.dismissedInterruptRequestId
                ? current.interrupt
                : nextInterruptRequestId && nextInterruptRequestId === current.dismissedInterruptRequestId
                    ? null
                    : resolvedInterrupt;

        const nextMessages =
            shouldKeepPendingUiState
                ? current.messages
                : data.messages;
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
            activeBranch: data.activeBranch ?? fallbackBranchingSession?.activeBranch ?? current.activeBranch,
            headCheckpoint: data.headCheckpoint ?? fallbackBranchingSession?.headCheckpoint ?? current.headCheckpoint,
            messageMetadataById: data.messageMetadataById
                ?? fallbackBranchingSession?.messageMetadataById
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

        return writeStoredSession(state, threadId, nextSession);
    });
}







export function resetChatStore() {
    useChatStore.setState({
        draftSession: null,
        sessionsByThreadId: {},
    });
}
