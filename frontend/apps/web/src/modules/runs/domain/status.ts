import { RunStatus } from '@/modules/runs/types/events';

export type RunStatusIndicator = 'running' | 'approval' | 'failed' | null;

export const ACTIVE_RUN_STATUSES: ReadonlySet<RunStatus | 'idle'> = new Set([
  RunStatus.Queued,
  RunStatus.Running,
  RunStatus.Interrupted,
  RunStatus.Resuming,
]);

export function isActiveRunStatus(status: RunStatus | 'idle'): boolean {
  return ACTIVE_RUN_STATUSES.has(status);
}

export function isStreamingRunStatus(status: RunStatus | 'idle'): boolean {
  return (
    status === RunStatus.Queued || status === RunStatus.Running || status === RunStatus.Resuming
  );
}

export function runStatusIndicator(status: RunStatus | 'idle'): RunStatusIndicator {
  if (status === RunStatus.Interrupted) return 'approval';
  if (status === RunStatus.Failed) return 'failed';
  if (status === RunStatus.Queued || status === RunStatus.Running || status === RunStatus.Resuming)
    return 'running';
  return null;
}
