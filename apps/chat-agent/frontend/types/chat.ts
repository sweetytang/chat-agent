import type { BaseMessage } from "@langchain/core/messages";
import type { ToolCallWithResult } from "@langchain/react";
import type { ThreadState, Checkpoint, Interrupt } from "@langchain/langgraph-sdk";
import type { MessageMetadata } from "@langchain/langgraph-sdk/ui";
import type { HITLRequest } from "@common/types/interrupt";

export type StateValue = { messages: BaseMessage[] };

export type ThreadStateSnapshot = ThreadState<StateValue>;

export type ThreadMessageBranchMetadata = Omit<MessageMetadata<StateValue>, 'streamMetadata'>;

export interface ThreadSession {
    messages: BaseMessage[];
    toolCalls: ToolCallWithResult[];
    isLoading: boolean;
    interrupt: Interrupt<HITLRequest> | null;
    dismissedInterruptRequestId: string | null;
    hydrated: boolean;
    isHydrating: boolean;
    history: ThreadStateSnapshot[];
    activeBranch: string;
    headCheckpoint: Checkpoint | null;
    messageMetadataById: Record<string, ThreadMessageBranchMetadata>;
}
