import { create } from "zustand";
import { eventText, type AgentEvent, type ChatMessage, type RunStatus } from "@/types/events";

interface RunState {
  runId: string | null;
  status: RunStatus | "idle";
  messages: ChatMessage[];
  error: string | null;
  lastSequence: number;
  reasoning: string;
  structuredOutput: Record<string, unknown> | null;
  generativeUi: Record<string, unknown> | null;
  toolResults: Array<{ tool: string; content: unknown }>;
  pendingApproval: { requestId: string; tool: string; runId: string } | null;
  addUserMessage: (content: string) => void;
  setHistory: (messages: ChatMessage[]) => void;
  applyEvent: (event: AgentEvent) => void;
  reset: () => void;
}

const statusByEvent: Partial<Record<AgentEvent["event"], RunStatus>> = {
  "run.queued": "queued", "run.started": "running", "run.resuming": "resuming", "run.cancelled": "cancelled",
  "run.completed": "completed", "run.failed": "failed",
};

export const useRunStore = create<RunState>((set) => ({
  runId: null, status: "idle", messages: [], error: null, lastSequence: -1,
  reasoning: "", structuredOutput: null, generativeUi: null, toolResults: [], pendingApproval: null,
  addUserMessage: (content) => set((state) => ({
    messages: [...state.messages, { id: `user-${Date.now()}`, role: "user", content, createdAt: new Date().toISOString() }],
    error: null, reasoning: "", structuredOutput: null, generativeUi: null, toolResults: [], pendingApproval: null, lastSequence: -1,
  })),
  setHistory: (messages) => set({ runId: null, status: "idle", messages, error: null, reasoning: "", structuredOutput: null, generativeUi: null, toolResults: [], pendingApproval: null, lastSequence: -1 }),
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
    let messages = state.messages;
    if (event.event === "message.started") {
      messages = [...messages, { id: String(event.data.message_id ?? `message-${event.sequence}`), role: "assistant", content: "", createdAt: new Date().toISOString() }];
    } else if (event.event === "message.delta" && content) {
      const last = messages.at(-1);
      if (last?.role === "assistant") messages = [...messages.slice(0, -1), { ...last, content: last.content + content }];
    }
    const error = event.event === "run.failed" ? String(event.data.error ?? "运行失败") : state.error;
    return { ...state, runId: event.run_id, status: statusByEvent[event.event] ?? state.status, messages, error, reasoning, structuredOutput, generativeUi, toolResults, pendingApproval, lastSequence: event.sequence };
  }),
  reset: () => set({ runId: null, status: "idle", messages: [], error: null, reasoning: "", structuredOutput: null, generativeUi: null, toolResults: [], pendingApproval: null, lastSequence: -1 }),
}));
