import type { BaseMessage } from "@langchain/core/messages";
import type { HITLRequest } from "@common/types/interrupt";
import type { ThreadCheckpoint, ThreadStateDTO, ThreadTaskState } from "@common/types/thread";
import type { ThreadHistoryState, ThreadMessageBranchMetadata } from "@frontend/types/chat";
import { deserializeMessages } from "./messageSerde";

interface BranchingSessionData {
    activeBranch: string;
    headCheckpoint: ThreadCheckpoint | null;
    interrupt: { value: HITLRequest } | null;
    messageMetadataById: Record<string, ThreadMessageBranchMetadata>;
    messages: BaseMessage[];
}

interface BranchContextInfo {
    flatHistory: ThreadHistoryState[];
    branchByCheckpoint: Record<string, { branch?: string; branchOptions: string[] }>;
    threadHead: ThreadHistoryState | undefined;
}

interface ResolvedBranchContext {
    branchContext: BranchContextInfo;
    resolvedActiveBranch: string;
}

interface BranchGraphNodeInfo {
    branchOptions: string[];
    checkpointId: string;
    parentCheckpointId: string | null;
    path: string[];
    state: ThreadHistoryState;
}

interface BranchGraph {
    childrenByParent: Map<string, BranchGraphNodeInfo[]>;
    nodesByCheckpoint: Map<string, BranchGraphNodeInfo>;
}

const ROOT_BRANCH_KEY = "$";

function getCheckpointId(state: ThreadHistoryState | undefined) {
    return state?.checkpoint?.checkpoint_id ?? null;
}

function compareHistoryState(a: ThreadHistoryState, b: ThreadHistoryState) {
    const createdAtA = a.created_at ?? "";
    const createdAtB = b.created_at ?? "";
    if (createdAtA !== createdAtB) {
        return createdAtA.localeCompare(createdAtB);
    }

    return (getCheckpointId(a) ?? "").localeCompare(getCheckpointId(b) ?? "");
}

export function sortHistoryChronologically(history: ThreadHistoryState[]) {
    return [...history].sort(compareHistoryState);
}

function getMessageId(message: BaseMessage, index: number) {
    return typeof message.id === "string" ? message.id : String(index);
}

function getMessageType(message: BaseMessage) {
    return (message as any)?._getType?.() ?? (message as any)?.type ?? null;
}

export function isRenderableChatMessage(message: BaseMessage) {
    const messageType = getMessageType(message);
    return messageType === "human" || messageType === "ai";
}

export function getHistoryMessages(values: { messages?: BaseMessage[] }) {
    if (!Array.isArray(values.messages)) {
        return [];
    }

    return values.messages.filter(isRenderableChatMessage);
}

function areMessagesEquivalent(current: BaseMessage, next: BaseMessage) {
    return getMessageType(current) === getMessageType(next)
        && JSON.stringify((current as any)?.content ?? null) === JSON.stringify((next as any)?.content ?? null)
        && JSON.stringify((current as any)?.tool_calls ?? null) === JSON.stringify((next as any)?.tool_calls ?? null)
        && JSON.stringify((current as any)?.tool_call_id ?? null) === JSON.stringify((next as any)?.tool_call_id ?? null);
}

function areMessageListsEquivalent(current: BaseMessage[], next: BaseMessage[]) {
    if (current.length !== next.length) {
        return false;
    }

    return current.every((message, index) => {
        const nextMessage = next[index];
        return Boolean(nextMessage) && areMessagesEquivalent(message, nextMessage);
    });
}

function getMessageAtIndex(
    state: ThreadHistoryState | undefined,
    messageIndex: number,
): BaseMessage | undefined {
    if (!state) {
        return undefined;
    }

    return getHistoryMessages(state.values)[messageIndex];
}

function findMessageVersionState(
    history: ThreadHistoryState[],
    checkpointStateById: Map<string, ThreadHistoryState>,
    targetMessage: BaseMessage,
    targetIndex: number,
): ThreadHistoryState | undefined {
    let matchingState: ThreadHistoryState | undefined;

    for (let index = history.length - 1; index >= 0; index -= 1) {
        const state = history[index];
        const currentMessage = getMessageAtIndex(state, targetIndex);
        if (!currentMessage || !areMessagesEquivalent(currentMessage, targetMessage)) {
            continue;
        }

        matchingState = state;

        const parentCheckpointId = state.parent_checkpoint?.checkpoint_id;
        const parentState = parentCheckpointId
            ? checkpointStateById.get(parentCheckpointId)
            : undefined;
        const parentMessage = getMessageAtIndex(parentState, targetIndex);

        if (!parentMessage || !areMessagesEquivalent(parentMessage, targetMessage)) {
            return state;
        }
    }

    return matchingState;
}

export function toThreadHistoryState(state: ThreadStateDTO): ThreadHistoryState {
    return {
        values: {
            ...state.values,
            messages: deserializeMessages(state.values.messages ?? []),
        },
        next: Array.isArray(state.next) ? state.next : [],
        tasks: Array.isArray(state.tasks) ? state.tasks : [],
        checkpoint: state.checkpoint,
        metadata: state.metadata ?? {},
        created_at: state.created_at,
        parent_checkpoint: state.parent_checkpoint,
    };
}

function extractInterrupt(tasks: ThreadTaskState[] = []): { value: HITLRequest } | null {
    for (const task of tasks) {
        const interruptValue = task?.interrupts?.find((item) => item?.value)?.value;
        if (interruptValue) {
            return { value: interruptValue };
        }
    }

    return null;
}

function createCheckpointStateMap(history: ThreadHistoryState[]) {
    return history.reduce<Map<string, ThreadHistoryState>>((acc, state) => {
        const checkpointId = getCheckpointId(state);
        if (typeof checkpointId === "string") {
            acc.set(checkpointId, state);
        }

        return acc;
    }, new Map<string, ThreadHistoryState>());
}

function createBranchGraph(history: ThreadHistoryState[]): BranchGraph {
    const orderedHistory = sortHistoryChronologically(history);
    const rawChildrenByParent = new Map<string, ThreadHistoryState[]>();

    // 预处理
    orderedHistory.forEach((state) => {
        const parentKey = state.parent_checkpoint?.checkpoint_id ?? ROOT_BRANCH_KEY;
        const siblings = rawChildrenByParent.get(parentKey) ?? [];
        siblings.push(state);
        rawChildrenByParent.set(parentKey, siblings);
    });

    const childrenByParent = new Map<string, BranchGraphNodeInfo[]>();
    const nodesByCheckpoint = new Map<string, BranchGraphNodeInfo>();

    const visit = (parentCheckpointId: string | null, parentPath: string[]) => {
        const parentKey = parentCheckpointId ?? ROOT_BRANCH_KEY;
        const children = rawChildrenByParent.get(parentKey) ?? [];
        const branchOptions = children.length > 1
            ? children
                .map((child) => {
                    const checkpointId = getCheckpointId(child);
                    return checkpointId ? [...parentPath, checkpointId].join(">") : "";
                })
                .filter(Boolean)
            : [];
        const childInfos: BranchGraphNodeInfo[] = [];

        for (const child of children) {
            const checkpointId = getCheckpointId(child);
            if (!checkpointId) {
                continue;
            }

            const path = children.length > 1
                ? [...parentPath, checkpointId]
                : parentPath;
            const nodeInfo: BranchGraphNodeInfo = {
                branchOptions,
                checkpointId,
                parentCheckpointId,
                path,
                state: child,
            };
            childInfos.push(nodeInfo);
            nodesByCheckpoint.set(checkpointId, nodeInfo);
            visit(checkpointId, path);
        }

        childrenByParent.set(parentKey, childInfos);
    };

    visit(null, []);

    return {
        childrenByParent,
        nodesByCheckpoint,
    };
}

function resolveLatestDescendantPath(
    branchGraph: BranchGraph,
    checkpointId: string,
) {
    const anchoredNode = branchGraph.nodesByCheckpoint.get(checkpointId);
    if (!anchoredNode) {
        return null;
    }

    // checkpoint 既可以表示“回到这个版本”，也可以表示“从这个版本继续分叉”。
    // 这里统一把它解析成该 checkpoint 在当前历史树上的最新后代路径。
    let latestPath = anchoredNode.path;
    let parentKey = checkpointId;

    while (true) {
        const children = branchGraph.childrenByParent.get(parentKey) ?? [];
        if (children.length === 0) {
            break;
        }

        const latestChild = children[children.length - 1];
        latestPath = latestChild.path;
        parentKey = latestChild.checkpointId;
    }

    return latestPath;
}

function resolveCheckpointAnchoredBranch(
    history: ThreadHistoryState[],
    checkpointId: string,
) {
    const branchGraph = createBranchGraph(history);
    const anchoredPath = resolveLatestDescendantPath(branchGraph, checkpointId);
    return anchoredPath?.join(">") ?? null;
}

function buildBranchContext(
    history: ThreadHistoryState[],
    requestedBranch: string,
): ResolvedBranchContext {
    const branchGraph = createBranchGraph(history);
    // 如果传入的是 checkpoint_id，就先把它扩展成当前历史里这条 checkpoint 对应的最新 branch path。
    const anchoredPath = resolveLatestDescendantPath(branchGraph, requestedBranch);
    const normalizedBranch = anchoredPath?.join(">") ?? requestedBranch;
    const requestedSegments = normalizedBranch.split(">").filter(Boolean);
    let requestedSegmentIndex = 0;
    let parentKey = ROOT_BRANCH_KEY;
    let threadHead: ThreadHistoryState | undefined;
    const flatHistory: ThreadHistoryState[] = [];
    const branchByCheckpoint: Record<string, { branch?: string; branchOptions: string[] }> = {};

    while (true) {
        const children = branchGraph.childrenByParent.get(parentKey) ?? [];
        if (children.length === 0) {
            break;
        }

        let chosenChild = children[children.length - 1];
        if (children.length > 1) {
            const requestedSegment = requestedSegments[requestedSegmentIndex];
            const matchedChild = requestedSegment
                ? children.find((child) => child.checkpointId === requestedSegment)
                : undefined;

            if (matchedChild) {
                chosenChild = matchedChild;
                requestedSegmentIndex += 1;
            }
        }

        flatHistory.push(chosenChild.state);
        threadHead = chosenChild.state;
        branchByCheckpoint[chosenChild.checkpointId] = chosenChild.path.length > 0
            ? {
                branch: chosenChild.path.join(">"),
                branchOptions: chosenChild.branchOptions,
            }
            : {
                branchOptions: chosenChild.branchOptions,
            };
        parentKey = chosenChild.checkpointId;
    }

    return {
        branchContext: {
            flatHistory,
            branchByCheckpoint,
            threadHead,
        },
        resolvedActiveBranch: threadHead
            ? branchByCheckpoint[getCheckpointId(threadHead) ?? ""]?.branch ?? ""
            : "",
    };
}

function resolveBranchContext(
    history: ThreadHistoryState[],
    activeBranch: string,
): ResolvedBranchContext {
    const initialBranchContext = buildBranchContext(history, activeBranch);
    if (initialBranchContext.branchContext.threadHead) {
        return initialBranchContext;
    }

    const checkpointAnchoredBranch = activeBranch
        ? resolveCheckpointAnchoredBranch(history, activeBranch)
        : null;
    if (checkpointAnchoredBranch) {
        const checkpointBranchContext = buildBranchContext(history, checkpointAnchoredBranch);
        if (checkpointBranchContext.branchContext.threadHead) {
            return checkpointBranchContext;
        }
    }

    return buildBranchContext(history, "");
}

function getBranchTail(branch: string | undefined) {
    if (!branch) {
        return null;
    }

    const segments = branch.split(">").filter(Boolean);
    return segments.length > 0 ? segments[segments.length - 1] : null;
}

function buildMessageBranchMetadata(
    orderedHistory: ThreadHistoryState[],
    visibleHistory: ThreadHistoryState[],
    branchContext: BranchContextInfo,
    message: BaseMessage,
    index: number,
): ThreadMessageBranchMetadata {
    const checkpointStateById = createCheckpointStateMap(visibleHistory);
    const messageId = getMessageId(message, index);
    const firstSeenState = findMessageVersionState(visibleHistory, checkpointStateById, message, index);
    const checkpointId = firstSeenState?.checkpoint?.checkpoint_id;
    const branchInfo = checkpointId
        ? branchContext.branchByCheckpoint[checkpointId]
        : undefined;
    const isOwnForkPoint = checkpointId != null && getBranchTail(branchInfo?.branch) === checkpointId;

    return {
        messageId,
        branch: isOwnForkPoint ? branchInfo?.branch : undefined,
        branchOptions: isOwnForkPoint ? branchInfo?.branchOptions ?? [] : [],
        firstSeenState,
    };
}

export function resolveCheckpointAnchorForMessages(
    history: ThreadHistoryState[],
    messages: BaseMessage[],
) {
    if (history.length === 0 || messages.length === 0) {
        return null;
    }

    const orderedHistory = sortHistoryChronologically(history);
    let matchingState: ThreadHistoryState | undefined;
    for (let index = orderedHistory.length - 1; index >= 0; index -= 1) {
        const state = orderedHistory[index];
        if (areMessageListsEquivalent(getHistoryMessages(state.values), messages)) {
            matchingState = state;
            break;
        }
    }

    return getCheckpointId(matchingState);
}

export function buildBranchingSessionData(
    history: ThreadHistoryState[],
    activeBranch: string,
): BranchingSessionData {
    const orderedHistory = sortHistoryChronologically(history);

    if (orderedHistory.length === 0) {
        return {
            activeBranch: "",
            headCheckpoint: null,
            interrupt: null,
            messageMetadataById: {},
            messages: [],
        };
    }

    const { branchContext, resolvedActiveBranch } = resolveBranchContext(orderedHistory, activeBranch);
    const headState = branchContext.threadHead as ThreadHistoryState | undefined;
    const currentValues = headState?.values ?? { messages: [] };
    const visibleHistory = (branchContext.flatHistory as ThreadHistoryState[]) ?? [];
    const messageMetadataById = getHistoryMessages(currentValues).reduce<Record<string, ThreadMessageBranchMetadata>>((acc, message, index) => {
        const metadata = buildMessageBranchMetadata(orderedHistory, visibleHistory, branchContext, message, index);
        acc[metadata.messageId] = metadata;
        return acc;
    }, {});

    return {
        activeBranch: resolvedActiveBranch,
        headCheckpoint: headState?.checkpoint ?? null,
        interrupt: extractInterrupt(headState?.tasks ?? []),
        messageMetadataById,
        messages: getHistoryMessages(currentValues),
    };
}
