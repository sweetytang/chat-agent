import type { Interrupt } from '@langchain/langgraph-sdk';
import type { HITLRequest } from "@common/types/interrupt";

function stableSerialize(value: unknown): string {
    if (value === null || typeof value !== "object") {
        return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
        return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
    }

    const entries = Object.entries(value as Record<string, unknown>)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(",")}}`;
}

function createInterruptFingerprint(value: HITLRequest) {
    try {
        return stableSerialize({
            actionRequests: value.actionRequests ?? [],
            reviewConfigs: value.reviewConfigs ?? [],
        });
    } catch {
        return null;
    }
}

function createInterruptRequestId(interrupt: Interrupt): string | null {
    if (!interrupt?.value || typeof interrupt.value !== "object") {
        return null;
    }

    const value = interrupt.value as HITLRequest;
    return value.requestId
        ?? createInterruptFingerprint(value)
        ?? interrupt.id
        ?? (Array.isArray(interrupt.ns) && interrupt.ns.length > 0 ? interrupt.ns.join("|") : null);
}



export function createChatInterrupt(interrupt: Interrupt | undefined): Interrupt<HITLRequest> | null {
    if (!interrupt?.value || typeof interrupt.value !== "object") {
        return null;
    }

    const requestId = createInterruptRequestId(interrupt);
    return {
        ...(interrupt.id ? { id: interrupt.id } : {}),
        ...(Array.isArray(interrupt.ns) && interrupt.ns.length > 0 ? { ns: interrupt.ns } : {}),
        value: {
            ...(interrupt.value as HITLRequest),
            ...(requestId ? { requestId } : {}),
        },
    };
}
