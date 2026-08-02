import type { PendingInterruptResponse } from "@/services/api";
import type { RunStatus } from "@/types/events";

export interface PendingApproval {
  requestId: string;
  runId: string;
  tool: string;
}

export interface PendingApprovalState {
  runId: string | null;
  status: RunStatus | "idle";
  pendingApproval: PendingApproval | null;
}

const STREAMING_STATUSES = new Set<RunStatus>(["queued", "running", "resuming"]);

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function pendingApprovalFromInterrupt(
  interrupt: PendingInterruptResponse,
): PendingApproval {
  return {
    requestId: interrupt.request_id,
    runId: interrupt.run_id,
    tool:
      optionalText(interrupt.tool) ??
      optionalText(interrupt.payload.tool) ??
      interrupt.kind,
  };
}

export function syncPendingApproval(
  state: PendingApprovalState,
  interrupt: PendingInterruptResponse | null,
  preserveRunState = false,
): PendingApprovalState {
  if (interrupt) {
    const pendingApproval = pendingApprovalFromInterrupt(interrupt);
    return {
      runId: pendingApproval.runId,
      status: "interrupted",
      pendingApproval,
    };
  }

  if (preserveRunState && STREAMING_STATUSES.has(state.status as RunStatus)) {
    return state;
  }

  return { ...state, pendingApproval: null };
}
