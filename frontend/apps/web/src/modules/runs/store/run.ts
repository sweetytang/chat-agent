import { create } from 'zustand';

import {
  syncPendingApproval,
  type PendingApproval,
} from '@/modules/interrupts/domain/pendingInterrupt';
import type { PendingInterruptResponse } from '@/modules/interrupts/types';
import { appendPresentationItem } from '@/modules/presentation/domain/items';
import type { PresentationItem, PresentationKind } from '@/modules/presentation/types';
import { isStreamingRunStatus } from '@/modules/runs/domain/status';
import { eventText, RunStatus, type AgentEvent } from '@/modules/runs/types/events';
import type { HistoryMessage, RunMode } from '@/modules/threads/types/history';

export interface RunRequestContext {
  content: string;
  checkpointId: string | null;
  mode: RunMode;
  showUserMessage?: boolean;
  baseHistory?: HistoryMessage[];
  threadId: string;
}

export interface ThreadRunState {
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
  lastRequest: RunRequestContext | null;
}

interface RunStore {
  threads: Record<string, ThreadRunState>;
  beginRun: (
    threadId: string,
    optimisticUserContent?: string,
    baseHistory?: HistoryMessage[],
  ) => void;
  prepareResume: (threadId: string) => void;
  setHistory: (threadId: string, history: HistoryMessage[], preserveRunState?: boolean) => void;
  setPendingApproval: (
    threadId: string,
    interrupt: PendingInterruptResponse | null,
    preserveRunState?: boolean,
  ) => void;
  setLastRequest: (threadId: string, request: RunRequestContext) => void;
  setRunError: (threadId: string, error: string, status?: RunStatus) => void;
  markCancelled: (threadId: string) => void;
  applyEvent: (event: AgentEvent) => void;
  migrateThread: (sourceThreadId: string, targetThreadId: string) => void;
  resetThread: (threadId: string) => void;
  resetAll: () => void;
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

const presentationKindByEvent: Partial<Record<AgentEvent['event'], PresentationKind>> = {
  'tool.result': 'tool-result',
  'tool.approval_required': 'approval',
  'structured_output.delta': 'structured-output',
  'generative_ui.delta': 'generative-ui',
  'run.failed': 'error',
  'mcp.error': 'error',
};

const EMPTY_HISTORY: HistoryMessage[] = [];
const EMPTY_TOOL_RESULTS: ThreadRunState['toolResults'] = [];
const EMPTY_PRESENTATION_ITEMS: PresentationItem[] = [];

export const EMPTY_THREAD_RUN_STATE: ThreadRunState = {
  runId: null,
  status: 'idle',
  history: EMPTY_HISTORY,
  error: null,
  lastSequence: -1,
  reasoning: '',
  structuredOutput: null,
  generativeUi: null,
  toolResults: EMPTY_TOOL_RESULTS,
  presentationItems: EMPTY_PRESENTATION_ITEMS,
  pendingApproval: null,
  lastRequest: null,
};

function createThreadRunState(): ThreadRunState {
  return {
    ...EMPTY_THREAD_RUN_STATE,
    history: [],
    toolResults: [],
    presentationItems: [],
  };
}

function eventString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

export function reduceRunEvent(state: ThreadRunState, event: AgentEvent): ThreadRunState {
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
      ? eventString(event.data.error, event.event === 'mcp.error' ? 'MCP 工具加载失败' : '运行失败')
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
}

export function selectThreadRun(state: RunStore, threadId: string): ThreadRunState {
  return state.threads[threadId] ?? EMPTY_THREAD_RUN_STATE;
}

function updateThread(
  threads: RunStore['threads'],
  threadId: string,
  update: (state: ThreadRunState) => ThreadRunState,
): RunStore['threads'] {
  return {
    ...threads,
    [threadId]: update(threads[threadId] ?? createThreadRunState()),
  };
}

export const useRunStore = create<RunStore>((set) => ({
  threads: {},

  beginRun: (threadId, optimisticUserContent, baseHistory) =>
    set((store) => ({
      threads: updateThread(store.threads, threadId, (state) => {
        const history = baseHistory ?? state.history;
        return {
          ...createThreadRunState(),
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
          lastRequest: state.lastRequest,
        };
      }),
    })),

  prepareResume: (threadId) =>
    set((store) => ({
      threads: updateThread(store.threads, threadId, (state) => ({
        ...state,
        status: RunStatus.Resuming,
        error: null,
        lastSequence: -1,
        pendingApproval: null,
      })),
    })),

  setHistory: (threadId, history, preserveRunState = false) =>
    set((store) => ({
      threads: updateThread(store.threads, threadId, (state) =>
        preserveRunState
          ? {
              ...state,
              // 运行中的后端快照可能落后于 SSE 投影；此时覆盖会丢失正在生成的消息。
              history:
                isStreamingRunStatus(state.status) || history.length === 0
                  ? state.history
                  : history,
            }
          : { ...createThreadRunState(), history },
      ),
    })),

  setPendingApproval: (threadId, interrupt, preserveRunState = false) =>
    set((store) => ({
      threads: updateThread(store.threads, threadId, (state) => ({
        ...state,
        ...syncPendingApproval(state, interrupt, preserveRunState),
      })),
    })),

  setLastRequest: (threadId, request) =>
    set((store) => ({
      threads: updateThread(store.threads, threadId, (state) => ({
        ...state,
        lastRequest: request,
      })),
    })),

  setRunError: (threadId, error, status) =>
    set((store) => ({
      threads: updateThread(store.threads, threadId, (state) => ({
        ...state,
        error,
        ...(status ? { status } : {}),
      })),
    })),

  markCancelled: (threadId) =>
    set((store) => ({
      threads: updateThread(store.threads, threadId, (state) => ({
        ...state,
        status: RunStatus.Cancelled,
        pendingApproval: null,
      })),
    })),

  applyEvent: (event) =>
    set((store) => ({
      threads: updateThread(store.threads, event.thread_id, (state) =>
        reduceRunEvent(state, event),
      ),
    })),

  migrateThread: (sourceThreadId, targetThreadId) =>
    set((store) => {
      const source = store.threads[sourceThreadId];
      if (!source || sourceThreadId === targetThreadId) return store;
      const threads = { ...store.threads, [targetThreadId]: source };
      delete threads[sourceThreadId];
      return { threads };
    }),

  resetThread: (threadId) =>
    set((store) => {
      if (!(threadId in store.threads)) return store;
      const threads = { ...store.threads };
      delete threads[threadId];
      return { threads };
    }),

  resetAll: () => set({ threads: {} }),
}));
