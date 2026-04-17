import type { Checkpoint } from "@langchain/langgraph-sdk";
import type { RunMetadata } from "@common/types/run";
import type { HITLResponse } from "@common/types/interrupt";

export enum ThreadStreamStatus {
    IDLE = "idle",
    PENDING = "pending",
    STREAMING = "streaming",
    STOPPING = "stopping",
}

export type ThreadStreamCommand =
    | { id: string; type: "submitMessage"; text: string; messageId: string; checkpoint: Checkpoint | null; metadata: RunMetadata }
    | { id: string; type: "regenerate"; checkpoint: Checkpoint; metadata: RunMetadata }
    | { id: string; type: "submitReview"; response: HITLResponse; metadata: RunMetadata };

export interface ThreadRuntime {
    workerId: string;
    threadId: string | null;
    status: ThreadStreamStatus;
    queuedCommands: ThreadStreamCommand[];
    pendingStopCommandId: string | null;
    lastActiveAt: number;
}
