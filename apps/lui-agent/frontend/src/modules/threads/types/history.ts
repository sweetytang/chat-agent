export type HistoryMessageRole = 'user' | 'assistant' | 'tool' | 'system';

export interface MessageBranchOption {
  checkpoint_id: string;
}

export interface HistoryMessage {
  id: string;
  role: HistoryMessageRole;
  content: string;
  checkpoint_id: string | null;
  parent_checkpoint_id: string | null;
  branch_options: MessageBranchOption[];
  branch_index: number | null;
}

export interface ThreadHistory {
  thread_id: string;
  current_checkpoint_id: string | null;
  messages: HistoryMessage[];
}

export type RunMode = 'send' | 'edit' | 'regenerate';

export interface RunStreamRequest {
  thread_id: string;
  content: string;
  checkpoint_id: string | null;
  mode: RunMode;
}
