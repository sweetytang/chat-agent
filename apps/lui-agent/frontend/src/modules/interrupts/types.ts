export interface PendingInterruptResponse {
  request_id: string;
  run_id: string;
  kind: string;
  tool?: string | null;
  payload: Record<string, unknown>;
}
