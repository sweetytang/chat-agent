import { request } from "@/shared/http/client";
import type { PendingInterruptResponse } from "@/modules/interrupts/types";

export const getPendingInterrupt = (threadId: string) => request<PendingInterruptResponse | null>(
  `/threads/${threadId}/interrupts/pending`,
);

export const resolveInterrupt = (
  requestId: string,
  decision: "approve" | "edit" | "reject",
) => request(`/interrupts/${requestId}/resolve`, {
  method: "POST",
  body: JSON.stringify({ decision }),
});

export const resumeInterrupt = (requestId: string) => request(
  `/interrupts/${requestId}/resume`,
  { method: "POST" },
);
