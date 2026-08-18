export interface BranchOption {
  checkpoint_id: string;
}

export type TimelineKind =
  'message' | 'reasoning' | 'tool' | 'structured_output' | 'generative_ui' | 'error';

export interface TimelineMeta {
  id: string;
  kind: TimelineKind;
  run_id: string | null;
  sequence: number;
  checkpoint_id?: string | null;
  parent_checkpoint_id?: string | null;
  branch_options?: BranchOption[];
  branch_index?: number | null;
}

export interface MessageItem extends Omit<TimelineMeta, 'kind'> {
  kind: 'message';
  logical_message_id: string;
  role: 'user' | 'assistant';
  content: string;
  status: 'streaming' | 'completed' | 'failed' | 'cancelled';
  terminal_segment: boolean;
}

export interface ReasoningItem extends Omit<TimelineMeta, 'kind'> {
  kind: 'reasoning';
  content: string;
  status: 'streaming' | 'completed' | 'failed' | 'cancelled';
}

export interface ToolItem extends Omit<TimelineMeta, 'kind'> {
  kind: 'tool';
  tool: string;
  arguments: Record<string, unknown>;
  request_id: string | null;
  result: unknown;
  status: 'running' | 'awaiting_approval' | 'completed' | 'failed' | 'cancelled';
}

export interface StructuredOutputItem extends Omit<TimelineMeta, 'kind'> {
  kind: 'structured_output';
  value: unknown;
  status: 'streaming' | 'completed' | 'failed' | 'cancelled';
}

export interface GenerativeUiItem extends Omit<TimelineMeta, 'kind'> {
  kind: 'generative_ui';
  value: unknown;
  status: 'streaming' | 'completed' | 'failed' | 'cancelled';
}

export interface ErrorItem extends Omit<TimelineMeta, 'kind'> {
  kind: 'error';
  message: string;
  status: 'failed';
}

export type TimelineItem =
  MessageItem | ReasoningItem | ToolItem | StructuredOutputItem | GenerativeUiItem | ErrorItem;

export interface TimelineSnapshot {
  version: 1;
  items: TimelineItem[];
}

export interface ThreadTimeline {
  thread_id: string;
  current_checkpoint_id: string | null;
  timeline: TimelineSnapshot;
}

export type RunMode = 'send' | 'edit' | 'regenerate';

export interface RunStreamRequest {
  thread_id: string;
  content: string;
  checkpoint_id: string | null;
  mode: RunMode;
}

export const EMPTY_TIMELINE: TimelineSnapshot = { version: 1, items: [] };
