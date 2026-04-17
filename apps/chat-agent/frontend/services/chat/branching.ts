import type { BaseMessage } from "@langchain/core/messages";
import { getBranchContext } from "@langchain/langgraph-sdk/ui";
import type { Checkpoint, ThreadTask, Interrupt } from "@langchain/langgraph-sdk";
import type { ThreadStateSnapshot, ThreadMessageBranchMetadata } from "@frontend/types/chat";
import type { HITLRequest } from "@common/types/interrupt";
import { createChatInterrupt } from "./interrupt";

interface BranchingSessionData {
    activeBranch: string;
    headCheckpoint: Checkpoint | null;
    interrupt: Interrupt<HITLRequest> | null;
    messageMetadataById: Record<string, ThreadMessageBranchMetadata>;
    messages: BaseMessage[];
}

function extractInterrupt(tasks: ThreadTask[] = []): Interrupt<HITLRequest> | null {
    for (const task of tasks) {
        const interrupt = task?.interrupts?.find((item) => item?.value);
        const chatInterrupt = interrupt ? createChatInterrupt(interrupt) : null;
        if (chatInterrupt) return chatInterrupt;
    }

    return null;
}



function buildBranchPathByCheckpoint(history: ThreadStateSnapshot[]) {
    // 构建map<checkpointId, children[]>多叉树
    const checkpointIds = new Set(
        history
            .map((state) => state.checkpoint?.checkpoint_id)
            .filter((checkpointId): checkpointId is string => Boolean(checkpointId)),
    );
    const childrenByParent = new Map<string | null, ThreadStateSnapshot[]>();

    for (const state of history) {
        const checkpointId = state.checkpoint?.checkpoint_id;
        if (!checkpointId) {
            continue;
        }

        const parentCheckpointId = state.parent_checkpoint?.checkpoint_id ?? null;
        const parentKey = parentCheckpointId && checkpointIds.has(parentCheckpointId)
            ? parentCheckpointId
            : null;
        const siblings = childrenByParent.get(parentKey) ?? [];
        siblings.push(state);
        childrenByParent.set(parentKey, siblings);
    }

    const branchByCheckpoint = new Map<string, string>();

    // dfs遍历多叉树，构建map<checkpointId, branchPath>
    const visitChildren = (
        parentCheckpointId: string | null,
        path: string[],
    ) => {
        const children = childrenByParent.get(parentCheckpointId) ?? [];
        const hasChildren = children.length > 1;
        for (const child of children) {
            const checkpointId = child.checkpoint?.checkpoint_id;
            if (!checkpointId) continue;

            if (hasChildren) path.push(checkpointId);
            branchByCheckpoint.set(checkpointId, path.join(">"));
            visitChildren(checkpointId, path);
            if (hasChildren) path.pop();
        }
    };

    visitChildren(null, []);
    return branchByCheckpoint;
}


function findFirstSeenStateInBranch(
    visibleHistory: ThreadStateSnapshot[],
    messageId: string | number,
) {
    return visibleHistory.find((state) =>
        state.values.messages
            ?.map((message, index) => (message.id ?? index))
            .includes(messageId)
    );
}


function buildMessageMetadataById(
    history: ThreadStateSnapshot[],
    activeBranch: string,
    messages: BaseMessage[],
) {
    const branchContext = getBranchContext(activeBranch, history);

    // 官方实现：所有分支的history（行不通，分支串了）
    // const metadataList = getMessagesMetadataMap({
    //     initialValues: { messages },
    //     history,
    //     getMessages: values => values.messages ?? [],
    //     branchContext: {
    //         threadHead: branchContext.threadHead,
    //         branchByCheckpoint: branchContext.branchByCheckpoint,
    //     }
    // });

    // 自己实现：当前分支的history
    const visibleHistory = branchContext.flatHistory;
    const alreadyShown = new Set<string>();
    const metadataList = messages.map((message, index) => {
        const messageId = message.id ?? index;
        const firstSeenState = findFirstSeenStateInBranch(visibleHistory, messageId);
        const checkpointId = firstSeenState?.checkpoint?.checkpoint_id;
        let branchInfo = checkpointId
            ? branchContext.branchByCheckpoint[checkpointId]
            : undefined;

        if (!branchInfo?.branch?.length) {
            branchInfo = undefined;
        }

        const optionsShown = branchInfo?.branchOptions?.flat(2).join(",");
        if (optionsShown) {
            if (alreadyShown.has(optionsShown)) {
                branchInfo = undefined;
            }
            alreadyShown.add(optionsShown);
        }

        return {
            messageId: messageId.toString(),
            firstSeenState,
            branch: branchInfo?.branch,
            branchOptions: branchInfo?.branchOptions,
        };
    });

    return Object.fromEntries(metadataList.map((metadata) => [metadata.messageId, metadata]));
}

export function buildBranchingSessionData(
    history: ThreadStateSnapshot[],
    activeBranch: string,
): BranchingSessionData {
    if (history.length === 0) {
        return {
            activeBranch: "",
            headCheckpoint: null,
            interrupt: null,
            messageMetadataById: {},
            messages: [],
        };
    }

    const branchByCheckpoint = buildBranchPathByCheckpoint(history);
    const knownBranches = new Set(["", ...branchByCheckpoint.values()]);
    const normalizedBranch = knownBranches.has(activeBranch)
        ? activeBranch
        : branchByCheckpoint.get(activeBranch) ?? activeBranch;
    const branchContext = getBranchContext(normalizedBranch, history);
    const threadHead = branchContext.threadHead;
    const headCheckpoint = threadHead?.checkpoint || null;
    const headCheckpointId = headCheckpoint?.checkpoint_id;
    const headValues = threadHead?.values ?? { messages: [] };
    const messages = headValues.messages ?? [];

    return {
        activeBranch: headCheckpointId ? branchContext.branchByCheckpoint[headCheckpointId]?.branch ?? normalizedBranch : "",
        headCheckpoint,
        interrupt: extractInterrupt(threadHead?.tasks ?? []),
        messageMetadataById: buildMessageMetadataById(history, normalizedBranch, messages),
        messages,
    };
}
