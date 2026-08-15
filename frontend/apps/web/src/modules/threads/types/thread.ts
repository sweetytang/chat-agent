export interface ThreadSummary {
  id: string;
  title: string | null;
  is_pinned: boolean;
  current_checkpoint_id: string | null;
}
