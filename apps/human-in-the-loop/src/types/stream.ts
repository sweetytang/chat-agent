import type { HITLResponse } from "./interrupt";

export type ThreadStreamStatus = "idle" | "booting" | "streaming" | "stopping";

export type ThreadStreamCommand =
    | { id: string; type: "submitMessage"; text: string; messageId: string }
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
