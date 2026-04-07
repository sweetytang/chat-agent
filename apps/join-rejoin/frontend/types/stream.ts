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
    | { id: string; createdAt: number; type: "submitMessage"; text: string; messageId: string; checkpoint: ThreadCheckpoint | null; preferredBranch: string; metadata: RunMetadata }
    | { id: string; createdAt: number; type: "regenerate"; checkpoint: ThreadCheckpoint; preferredBranch: string; metadata: RunMetadata }
    | { id: string; createdAt: number; type: "submitReview"; response: HITLResponse; metadata: RunMetadata };

export interface ThreadRuntime {
    workerId: string;
    threadId: string | null;
    status: ThreadStreamStatus;
    queuedCommands: ThreadStreamCommand[];
    pendingStopCommandId: string | null;
    lastError: string | null;
    lastActiveAt: number;
}
