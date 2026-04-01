import {
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
} from "@langchain/core/messages";
import { SERVER_URL } from "../../constants";
import { getAuthHeaders } from "../../utils/authClient";
import type { ThreadSession } from "../../types/chat";
import type { HITLRequest } from "../../types/interrupt";
import type { SerializedMessage } from "../../types";
import { MessageTypeEnum } from "../../types";

interface ThreadTaskInterrupt {
    value?: HITLRequest;
}

interface ThreadTask {
    interrupts?: ThreadTaskInterrupt[];
}

interface ThreadStateResponse {
    values?: {
        messages?: SerializedMessage[];
    };
    tasks?: ThreadTask[];
}

function toMessageContent(content: unknown) {
    if (typeof content === "string" || Array.isArray(content)) {
        return content;
    }

    return "";
}

function deserializeMessages(messages: SerializedMessage[] = []): BaseMessage[] {
    return messages.map((message) => {
        const { type, content, id, tool_calls, tool_call_id } = message;
        const safeToolCalls = Array.isArray(tool_calls) ? tool_calls : [];
        const safeContent = toMessageContent(content);

        switch (type) {
            case MessageTypeEnum.SYSTEM:
                return new SystemMessage({ content: safeContent, id });
            case MessageTypeEnum.AI:
                return new AIMessage({ content: safeContent, id, tool_calls: safeToolCalls as any });
            case MessageTypeEnum.TOOL:
                return new ToolMessage({ content: safeContent, id, tool_call_id: tool_call_id ?? id });
            case MessageTypeEnum.HUMAN:
            default:
                return new HumanMessage({ content: safeContent, id });
        }
    });
}

function extractInterrupt(tasks: ThreadTask[] = []): { value: HITLRequest } | null {
    for (const task of tasks) {
        const interruptValue = task?.interrupts?.find((item) => item?.value)?.value;
        if (interruptValue) {
            return { value: interruptValue };
        }
    }

    return null;
}

export async function fetchThreadSession(threadId: string): Promise<Pick<ThreadSession, "messages" | "toolCalls" | "isLoading" | "interrupt" | "hydrated" | "isHydrating">> {
    const response = await fetch(`${SERVER_URL}/threads/${threadId}/state`, {
        headers: getAuthHeaders(),
    });

    if (!response.ok) {
        throw new Error(`Failed to load thread state: ${response.status}`);
    }

    const data = await response.json() as ThreadStateResponse;

    return {
        messages: deserializeMessages(data.values?.messages || []),
        toolCalls: [],
        isLoading: false,
        interrupt: extractInterrupt(data.tasks),
        hydrated: true,
        isHydrating: false,
    };
}
