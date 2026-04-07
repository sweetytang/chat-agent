import { SERVER_URL } from "@common/constants";
import { getAuthHeaders } from "../../utils/authClient";
import type { ThreadStateDTO } from "@common/types/thread";
import type { ThreadSession } from "@frontend/types/chat";
import { buildBranchingSessionData, sortHistoryChronologically, toThreadHistoryState } from "./branching";

export async function fetchThreadSession(
    threadId: string,
    preferredBranch = "",
): Promise<Pick<ThreadSession, "messages" | "toolCalls" | "isLoading" | "interrupt" | "hydrated" | "isHydrating" | "history" | "activeBranch" | "headCheckpoint" | "messageMetadataById">> {
    const headers = getAuthHeaders();
    const [stateResponse, historyResponse] = await Promise.all([
        fetch(`${SERVER_URL}/threads/${threadId}/state`, {
            headers,
        }),
        fetch(`${SERVER_URL}/threads/${threadId}/history`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...headers,
            },
            body: JSON.stringify({ limit: 100 }),
        }),
    ]);

    if (!stateResponse.ok) {
        throw new Error(`Failed to load thread state: ${stateResponse.status}`);
    }

    if (!historyResponse.ok) {
        throw new Error(`Failed to load thread history: ${historyResponse.status}`);
    }

    const historyData = await historyResponse.json() as ThreadStateDTO[];
    const history = sortHistoryChronologically(historyData.map(toThreadHistoryState));
    const branchingSession = buildBranchingSessionData(history, preferredBranch);

    return {
        messages: branchingSession.messages,
        toolCalls: [],
        isLoading: false,
        interrupt: branchingSession.interrupt,
        hydrated: true,
        isHydrating: false,
        history,
        activeBranch: branchingSession.activeBranch,
        headCheckpoint: branchingSession.headCheckpoint,
        messageMetadataById: branchingSession.messageMetadataById,
    };
}
