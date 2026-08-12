import { RunStatus } from '@/modules/runs/types/events';

export const ACTIVE_RUN_STATUSES: ReadonlySet<RunStatus | 'idle'> = new Set([
  RunStatus.Queued,
  RunStatus.Running,
  RunStatus.Interrupted,
  RunStatus.Resuming,
]);
