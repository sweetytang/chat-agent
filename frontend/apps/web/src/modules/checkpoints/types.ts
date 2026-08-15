export interface CheckpointSummary {
  id: string;
  thread_id: string;
  parent_id: string | null;
  state: Record<string, unknown>;
  branch_name: string | null;
}
