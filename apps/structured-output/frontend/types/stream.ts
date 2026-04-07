import type { RunMetadata } from "@common/types/run";
import type { HITLResponse } from "@common/types/interrupt";
import type { ThreadCheckpoint } from "@common/types/thread";

export enum ThreadStreamStatus {
    IDLE = "idle",
    PENDING = "pending",
    STREAMING = "streaming",
    STOPPING = "stopping",
}

export type ThreadStreamCommand =
    | { id: string; type: "submitMessage"; text: string; messageId: string; checkpoint: ThreadCheckpoint | null; preferredBranch: string; metadata: RunMetadata }
    | { id: string; type: "regenerate"; checkpoint: ThreadCheckpoint; preferredBranch: string; metadata: RunMetadata }
    | { id: string; type: "submitReview"; response: HITLResponse; metadata: RunMetadata }
    | { id: string; type: "stop" };

export interface ThreadRuntime {
    workerId: string;
    threadId: string | null;
    status: ThreadStreamStatus;
    pendingCommand: ThreadStreamCommand | null;
    lastError: string | null;
    lastActiveAt: number;
}
