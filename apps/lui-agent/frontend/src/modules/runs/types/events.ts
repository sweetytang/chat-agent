export enum RunStatus {
  Queued = 'queued',
  Running = 'running',
  Interrupted = 'interrupted',
  Resuming = 'resuming',
  Completed = 'completed',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

export interface EventBase {
  version: 1;
  event: string;
  run_id: string;
  thread_id: string;
  sequence: number;
  data: Record<string, unknown>;
}

export type AgentEvent = EventBase & {
  event:
    | 'run.queued'
    | 'run.started'
    | 'run.resuming'
    | 'run.cancelled'
    | 'run.completed'
    | 'run.failed'
    | 'message.started'
    | 'message.delta'
    | 'message.completed'
    | 'reasoning.delta'
    | 'reasoning.completed'
    | 'tool.call'
    | 'tool.approval_required'
    | 'tool.result'
    | 'mcp.error'
    | 'checkpoint.created'
    | 'thread.updated'
    | 'structured_output.delta'
    | 'generative_ui.delta';
};

export function isAgentEvent(value: unknown): value is AgentEvent {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Partial<EventBase>;
  return (
    event.version === 1 &&
    typeof event.event === 'string' &&
    typeof event.run_id === 'string' &&
    typeof event.thread_id === 'string' &&
    typeof event.sequence === 'number' &&
    typeof event.data === 'object' &&
    event.data !== null
  );
}

export function eventText(event: AgentEvent): string {
  const content = event.data.content;
  return typeof content === 'string' ? content : '';
}
