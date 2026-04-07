import type { BaseMessage } from "@langchain/core/messages";
import type { ToolCallWithResult } from "@langchain/react";
import type { HITLRequest } from "@common/types/interrupt";
import type { ThreadCheckpoint, ThreadTaskState } from "@common/types/thread";

export interface ThreadHistoryState {
    values: {
        messages?: BaseMessage[];
    };
    next: string[];
    tasks: ThreadTaskState[];
    checkpoint: ThreadCheckpoint | null;
    metadata: Record<string, unknown>;
    created_at: string | null;
    parent_checkpoint: ThreadCheckpoint | null;
}

export interface ThreadMessageBranchMetadata {
    messageId: string;
    branch: string | undefined;
    branchOptions: string[];
    firstSeenState: ThreadHistoryState | undefined;
}

export interface ThreadSession {
    messages: BaseMessage[];
    toolCalls: ToolCallWithResult[];
    isLoading: boolean;
    interrupt: { value: HITLRequest } | null;
    dismissedInterruptRequestId: string | null;
    hydrated: boolean;
    isHydrating: boolean;
    history: ThreadHistoryState[];
    activeBranch: string;
    headCheckpoint: ThreadCheckpoint | null;
    messageMetadataById: Record<string, ThreadMessageBranchMetadata>;
}
