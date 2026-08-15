import { create } from 'zustand';

import {
  syncPendingApproval,
  type PendingApproval,
} from '@/modules/interrupts/domain/pendingInterrupt';
import type { PendingInterruptResponse } from '@/modules/interrupts/types';
import { appendPresentationItem } from '@/modules/presentation/domain/items';
import type { PresentationItem, PresentationKind } from '@/modules/presentation/types';
import { eventText, RunStatus, type AgentEvent } from '@/modules/runs/types/events';
import type { HistoryMessage } from '@/modules/threads/types/history';

interface RunState {
  runId: string | null;
  status: RunStatus | 'idle';
  history: HistoryMessage[];
  error: string | null;
  lastSequence: number;
  reasoning: string;
  structuredOutput: Record<string, unknown> | null;
  generativeUi: Record<string, unknown> | null;
  toolResults: { tool: string; content: unknown }[];
  presentationItems: PresentationItem[];
  pendingApproval: PendingApproval | null;
  beginRun: (optimisticUserContent?: string, baseHistory?: HistoryMessage[]) => void;
  prepareResume: () => void;
  setHistory: (history: HistoryMessage[], preserveRunState?: boolean) => void;
  setPendingApproval: (
    interrupt: PendingInterruptResponse | null,
    preserveRunState?: boolean,
  ) => void;
  applyEvent: (event: AgentEvent) => void;
  reset: () => void;
}

const statusByEvent: Partial<Record<AgentEvent['event'], RunStatus>> = {
  'run.queued': RunStatus.Queued,
  'run.started': RunStatus.Running,
  'run.resuming': RunStatus.Resuming,
  'run.cancelled': RunStatus.Cancelled,
  'run.completed': RunStatus.Completed,
  'run.failed': RunStatus.Failed,
  'tool.approval_required': RunStatus.Interrupted,
};

function eventString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

const presentationKindByEvent: Partial<Record<AgentEvent['event'], PresentationKind>> = {
  'tool.result': 'tool-result',
  'tool.approval_required': 'approval',
  'structured_output.delta': 'structured-output',
  'generative_ui.delta': 'generative-ui',
  'run.failed': 'error',
  'mcp.error': 'error',
};

export const useRunStore = create<RunState>((set) => ({
  runId: null,
  status: 'idle',
  history: [],
  error: null,
  lastSequence: -1,
  reasoning: '',
  structuredOutput: null,
  generativeUi: null,
  toolResults: [],
  presentationItems: [],
  pendingApproval: null,
  beginRun: (optimisticUserContent, baseHistory) =>
    set((state) => {
      const history = baseHistory ?? state.history;
      return {
        runId: null,
        status: RunStatus.Queued,
        history: optimisticUserContent
          ? [
              ...history,
              {
                id: `user-${Date.now()}`,
                role: 'user',
                content: optimisticUserContent,
                checkpoint_id: null,
                parent_checkpoint_id: null,
                branch_options: [],
                branch_index: null,
              },
            ]
          : history,
        error: null,
        reasoning: '',
        structuredOutput: null,
        generativeUi: null,
        toolResults: [],
        presentationItems: [],
        pendingApproval: null,
        lastSequence: -1,
      };
    }),
  prepareResume: () => set({ status: RunStatus.Resuming, error: null, lastSequence: -1 }),
  setHistory: (history, preserveRunState = false) =>
    set((state) =>
      preserveRunState
        ? { ...state, history: history.length > 0 ? history : state.history }
        : {
            runId: null,
            status: 'idle',
            history,
            error: null,
            lastSequence: -1,
            reasoning: '',
            structuredOutput: null,
            generativeUi: null,
            toolResults: [],
            presentationItems: [],
            pendingApproval: null,
          },
    ),
  setPendingApproval: (interrupt, preserveRunState = false) =>
    set((state) => ({
      ...state,
      ...syncPendingApproval(state, interrupt, preserveRunState),
    })),
  applyEvent: (event) =>
    set((state) => {
      if (event.sequence <= state.lastSequence) return state;
      const content = eventText(event);
      const reasoning =
        event.event === 'reasoning.delta' && content ? state.reasoning + content : state.reasoning;
      const structuredOutput =
        event.event === 'structured_output.delta' ? event.data : state.structuredOutput;
      const generativeUi = event.event === 'generative_ui.delta' ? event.data : state.generativeUi;
      const toolResults =
        event.event === 'tool.result'
          ? [
              ...state.toolResults,
              { tool: eventString(event.data.tool, 'tool'), content: event.data.content },
            ]
          : state.toolResults;
      const presentationKind = presentationKindByEvent[event.event];
      const presentationItems = presentationKind
        ? appendPresentationItem(
            state.presentationItems,
            event.run_id,
            event.sequence,
            presentationKind,
            event.data,
          )
        : state.presentationItems;
      const pendingApproval =
        event.event === 'tool.approval_required'
          ? {
              requestId: eventString(event.data.request_id, ''),
              tool: eventString(event.data.tool, 'tool'),
              runId: event.run_id,
            }
          : event.event === 'run.completed' || event.event === 'run.cancelled'
            ? null
            : state.pendingApproval;
      let history = state.history;
      if (event.event === 'message.started') {
        history = [
          ...history,
          {
            id: eventString(event.data.message_id, `${event.run_id}-message-${event.sequence}`),
            role: 'assistant',
            content: '',
            checkpoint_id: null,
            parent_checkpoint_id: null,
            branch_options: [],
            branch_index: null,
            is_streaming: true,
          },
        ];
      } else if (event.event === 'message.delta' && content) {
        const last = history.at(-1);
        if (last?.role === 'assistant')
          history = [...history.slice(0, -1), { ...last, content: last.content + content }];
      } else if (event.event === 'message.completed') {
        const last = history.at(-1);
        if (last?.role === 'assistant')
          history = [...history.slice(0, -1), { ...last, is_streaming: false }];
      }
      const error =
        event.event === 'run.failed' || event.event === 'mcp.error'
          ? eventString(
              event.data.error,
              event.event === 'mcp.error' ? 'MCP 工具加载失败' : '运行失败',
            )
          : state.error;
      return {
        ...state,
        runId: event.run_id,
        status: statusByEvent[event.event] ?? state.status,
        history,
        error,
        reasoning,
        structuredOutput,
        generativeUi,
        toolResults,
        presentationItems,
        pendingApproval,
        lastSequence: event.sequence,
      };
    }),
  reset: () =>
    set({
      runId: null,
      status: 'idle',
      history: [],
      error: null,
      reasoning: '',
      structuredOutput: null,
      generativeUi: null,
      toolResults: [],
      presentationItems: [],
      pendingApproval: null,
      lastSequence: -1,
    }),
}));
