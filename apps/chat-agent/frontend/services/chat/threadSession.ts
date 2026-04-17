import type { ThreadStateDTO } from "@common/types/thread";
import type { ThreadSession } from "@frontend/types/chat";
import { buildBranchingSessionData } from "./branching";
import { langGraphClient } from "@frontend/services/langgraph/client";
import { deserializeMessages } from "./messageSerde";
import { ThreadStateSnapshot } from "@frontend/types/chat";


function toThreadHistoryState(state: ThreadStateDTO): ThreadStateSnapshot {
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

export async function fetchThreadSession(
    threadId: string,
    preferredBranch = "",
): Promise<Pick<ThreadSession, "messages" | "toolCalls" | "isLoading" | "interrupt" | "hydrated" | "isHydrating" | "history" | "activeBranch" | "headCheckpoint" | "messageMetadataById">> {
    const historyData = await langGraphClient.threads.getHistory(threadId, { limit: 100 });
    const history = (historyData as ThreadStateDTO[]).map(toThreadHistoryState);
    const branchingSession = buildBranchingSessionData(history, preferredBranch);

    return {
        toolCalls: [],
        isLoading: false,
        hydrated: true,
        isHydrating: false,
        history,
        ...branchingSession,
    };
}
