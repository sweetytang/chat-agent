import type { HITLResponse } from "@common/types/interrupt";
import type { ThreadCheckpoint } from "@common/types/thread";

export enum ThreadStreamStatus {
    IDLE = "idle",
    PENDING = "pending",
    STREAMING = "streaming",
    STOPPING = "stopping",
}

export type ThreadStreamCommand =
    | { id: string; type: "submitMessage"; text: string; messageId: string; checkpoint: ThreadCheckpoint | null; preferredBranch: string }
    | { id: string; type: "regenerate"; checkpoint: ThreadCheckpoint; preferredBranch: string }
    | { id: string; type: "submitReview"; response: HITLResponse }
    | { id: string; type: "stop" };

export interface ThreadRuntime {
    workerId: string;
    threadId: string | null;
    status: ThreadStreamStatus;
    pendingCommand: ThreadStreamCommand | null;
    lastError: string | null;
    lastActiveAt: number;
}
