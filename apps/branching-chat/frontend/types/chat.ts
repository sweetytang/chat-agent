import type { BaseMessage } from "@langchain/core/messages";
import type { ToolCallWithResult } from "@langchain/react";
import type { HITLRequest } from "@common/types/interrupt";

export interface ThreadSession {
    messages: BaseMessage[];
    toolCalls: ToolCallWithResult[];
    isLoading: boolean;
    interrupt: { value: HITLRequest } | null;
    dismissedInterruptRequestId: string | null;
    hydrated: boolean;
    isHydrating: boolean;
}
