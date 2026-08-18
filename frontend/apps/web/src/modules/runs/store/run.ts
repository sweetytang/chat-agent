import { create } from 'zustand';

import {
  syncPendingApproval,
  type PendingApproval,
} from '@/modules/interrupts/domain/pendingInterrupt';
import type { PendingInterruptResponse } from '@/modules/interrupts/types';
import { isStreamingRunStatus } from '@/modules/runs/domain/status';
import { RunStatus, type AgentEvent } from '@/modules/runs/types/events';
import { normalizeTimelineEvent } from '@/modules/timeline/domain/normalizeEvent';
import { reduceTimeline } from '@/modules/timeline/domain/reduceTimeline';
import { EMPTY_TIMELINE, type RunMode, type TimelineSnapshot } from '@/modules/timeline/types';

export interface RunRequestContext {
  content: string;
  checkpointId: string | null;
  mode: RunMode;
  showUserMessage?: boolean;
  baseTimeline?: TimelineSnapshot;
  threadId: string;
}

export interface ThreadRunState {
  runId: string | null;
  status: RunStatus | 'idle';
  timeline: TimelineSnapshot;
  lastSequence: number;
  pendingApproval: PendingApproval | null;
  lastRequest: RunRequestContext | null;
}

interface RunStore {
  threads: Record<string, ThreadRunState>;
  beginRun: (
    threadId: string,
    optimisticUserContent?: string,
    baseTimeline?: TimelineSnapshot,
  ) => void;
  prepareResume: (threadId: string) => void;
  setTimeline: (threadId: string, timeline: TimelineSnapshot, preserveRunState?: boolean) => void;
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

export const EMPTY_THREAD_RUN_STATE: ThreadRunState = {
  runId: null,
  status: 'idle',
  timeline: EMPTY_TIMELINE,
  lastSequence: -1,
  pendingApproval: null,
  lastRequest: null,
};

function createThreadRunState(): ThreadRunState {
  return { ...EMPTY_THREAD_RUN_STATE, timeline: { version: 1, items: [] } };
}

function eventString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function appendLocalError(
  timeline: TimelineSnapshot,
  message: string,
  runId: string | null,
): TimelineSnapshot {
  const id = `${runId ?? 'local'}:error:${Date.now()}`;
  return {
    version: 1,
    items: [
      ...timeline.items,
      { id, kind: 'error', run_id: runId, sequence: -1, status: 'failed', message },
    ],
  };
}

export function reduceRunEvent(state: ThreadRunState, event: AgentEvent): ThreadRunState {
  if (event.sequence <= state.lastSequence) return state;

  const normalized = normalizeTimelineEvent(event);
  let timeline = state.timeline;
  if (normalized) {
    try {
      timeline = reduceTimeline(timeline, normalized);
    } catch (error) {
      timeline = appendLocalError(
        timeline,
        error instanceof Error ? error.message : '时间线事件无效',
        event.run_id,
      );
    }
  }

  const pendingApproval =
    event.event === 'tool.approval_required'
      ? {
          requestId: eventString(event.data.request_id, ''),
          tool: eventString(event.data.tool, 'tool'),
          runId: event.run_id,
        }
      : event.event === 'run.completed' ||
          event.event === 'run.cancelled' ||
          event.event === 'run.failed'
        ? null
        : state.pendingApproval;

  return {
    ...state,
    runId: event.run_id,
    status: statusByEvent[event.event] ?? state.status,
    timeline,
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

  beginRun: (threadId, optimisticUserContent, baseTimeline) =>
    set((store) => ({
      threads: updateThread(store.threads, threadId, (state) => {
        const timeline = baseTimeline ?? state.timeline;
        const optimisticTimeline = optimisticUserContent
          ? {
              version: 1 as const,
              items: [
                ...timeline.items,
                {
                  id: `user-${Date.now()}`,
                  kind: 'message' as const,
                  run_id: null,
                  sequence: -1,
                  logical_message_id: `user-${Date.now()}`,
                  role: 'user' as const,
                  content: optimisticUserContent,
                  status: 'completed' as const,
                  terminal_segment: true,
                },
              ],
            }
          : timeline;
        return {
          ...createThreadRunState(),
          status: RunStatus.Queued,
          timeline: optimisticTimeline,
          lastRequest: state.lastRequest,
        };
      }),
    })),

  prepareResume: (threadId) =>
    set((store) => ({
      threads: updateThread(store.threads, threadId, (state) => ({
        ...state,
        status: RunStatus.Resuming,
        lastSequence: -1,
        pendingApproval: null,
      })),
    })),

  setTimeline: (threadId, timeline, preserveRunState = false) =>
    set((store) => ({
      threads: updateThread(store.threads, threadId, (state) =>
        preserveRunState && isStreamingRunStatus(state.status)
          ? state
          : preserveRunState
            ? { ...state, timeline }
            : { ...createThreadRunState(), timeline },
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
        timeline: appendLocalError(state.timeline, error, state.runId),
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
