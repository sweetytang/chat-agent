import type { AgentEvent } from '@/modules/runs/types/events';

export type TimelineEvent = AgentEvent & {
  data: Record<string, unknown> & {
    item_id?: string;
    message_id?: string;
    tool_call_id?: string;
  };
};

const TIMELINE_EVENTS = new Set<AgentEvent['event']>([
  'message.started',
  'message.delta',
  'message.completed',
  'reasoning.delta',
  'reasoning.completed',
  'tool.call',
  'tool.approval_required',
  'tool.result',
  'structured_output.delta',
  'generative_ui.delta',
  'run.failed',
  'run.cancelled',
  'run.completed',
  'mcp.error',
]);

export function normalizeTimelineEvent(event: AgentEvent): TimelineEvent | null {
  if (!TIMELINE_EVENTS.has(event.event)) return null;
  return event;
}

export function requireEventId(
  event: TimelineEvent,
  field: 'item_id' | 'message_id' | 'tool_call_id',
): string {
  const value = event.data[field];
  if (typeof value !== 'string' || !value) throw new Error(`${event.event} 缺少稳定 ${field}`);
  return value;
}
