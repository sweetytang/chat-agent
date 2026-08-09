import { create } from "zustand";

import type { PendingInterruptResponse } from "@/modules/interrupts/types";
import { eventText, type AgentEvent, type RunStatus } from "@/modules/runs/types/events";
import type { HistoryMessage } from "@/modules/threads/types/history";
import {
  syncPendingApproval,
  type PendingApproval,
} from "@/modules/interrupts/domain/pendingInterrupt";

interface RunState {
  runId: string | null;
  status: RunStatus | "idle";
  history: HistoryMessage[];
  error: string | null;
  lastSequence: number;
  reasoning: string;
  structuredOutput: Record<string, unknown> | null;
  generativeUi: Record<string, unknown> | null;
  toolResults: Array<{ tool: string; content: unknown }>;
  pendingApproval: PendingApproval | null;
  beginRun: (optimisticUserContent?: string, baseHistory?: HistoryMessage[]) => void;
  prepareResume: () => void;
  setHistory: (history: HistoryMessage[], preserveRunState?: boolean) => void;
  setPendingApproval: (interrupt: PendingInterruptResponse | null, preserveRunState?: boolean) => void;
  applyEvent: (event: AgentEvent) => void;
  reset: () => void;
}

const statusByEvent: Partial<Record<AgentEvent["event"], RunStatus>> = {
  "run.queued": "queued", "run.started": "running", "run.resuming": "resuming", "run.cancelled": "cancelled",
  "run.completed": "completed", "run.failed": "failed", "tool.approval_required": "interrupted",
};

export const useRunStore = create<RunState>((set) => ({
  runId: null, status: "idle", history: [], error: null, lastSequence: -1,
  reasoning: "", structuredOutput: null, generativeUi: null, toolResults: [], pendingApproval: null,
  beginRun: (optimisticUserContent, baseHistory) => set((state) => {
    const history = baseHistory ?? state.history;
    return {
      runId: null,
      status: "queued",
      history: optimisticUserContent
        ? [...history, {
          id: `user-${Date.now()}`,
          role: "user",
          content: optimisticUserContent,
          checkpoint_id: null,
          parent_checkpoint_id: null,
          branch_options: [],
          branch_index: null,
        }]
        : history,
      error: null,
      reasoning: "",
      structuredOutput: null,
      generativeUi: null,
      toolResults: [],
      pendingApproval: null,
      lastSequence: -1,
    };
  }),
  prepareResume: () => set({ status: "resuming", error: null, lastSequence: -1 }),
  setHistory: (history, preserveRunState = false) => set((state) => preserveRunState
    ? { ...state, history }
    : {
        runId: null,
        status: "idle",
        history,
        error: null,
        lastSequence: -1,
        reasoning: "",
        structuredOutput: null,
        generativeUi: null,
        toolResults: [],
        pendingApproval: null,
      }),
  setPendingApproval: (interrupt, preserveRunState = false) => set((state) => ({
    ...state,
    ...syncPendingApproval(state, interrupt, preserveRunState),
  })),
  applyEvent: (event) => set((state) => {
    if (event.sequence <= state.lastSequence) return state;
    const content = eventText(event);
    const reasoning = event.event === "reasoning.delta" && content ? state.reasoning + content : state.reasoning;
    const structuredOutput = event.event === "structured_output.delta" ? event.data : state.structuredOutput;
    const generativeUi = event.event === "generative_ui.delta" ? event.data : state.generativeUi;
    const toolResults = event.event === "tool.result"
      ? [...state.toolResults, { tool: String(event.data.tool ?? "tool"), content: event.data.content }]
      : state.toolResults;
    const pendingApproval = event.event === "tool.approval_required"
      ? { requestId: String(event.data.request_id ?? ""), tool: String(event.data.tool ?? "tool"), runId: event.run_id }
      : event.event === "run.completed" || event.event === "run.cancelled" ? null : state.pendingApproval;
    let history = state.history;
    if (event.event === "message.started") {
      history = [...history, {
        id: String(event.data.message_id ?? `${event.run_id}-message-${event.sequence}`),
        role: "assistant",
        content: "",
        checkpoint_id: null,
        parent_checkpoint_id: null,
        branch_options: [],
        branch_index: null,
      }];
    } else if (event.event === "message.delta" && content) {
      const last = history.at(-1);
      if (last?.role === "assistant") history = [...history.slice(0, -1), { ...last, content: last.content + content }];
    }
    const error = event.event === "run.failed" ? String(event.data.error ?? "运行失败") : state.error;
    return { ...state, runId: event.run_id, status: statusByEvent[event.event] ?? state.status, history, error, reasoning, structuredOutput, generativeUi, toolResults, pendingApproval, lastSequence: event.sequence };
  }),
  reset: () => set({ runId: null, status: "idle", history: [], error: null, reasoning: "", structuredOutput: null, generativeUi: null, toolResults: [], pendingApproval: null, lastSequence: -1 }),
}));
