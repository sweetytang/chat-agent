import { CircleAlert, LoaderCircle, ShieldAlert } from 'lucide-react';

import { runStatusIndicator } from '@/modules/runs/domain/status';
import { selectThreadRun, useRunStore } from '@/modules/runs/store/run';

import styles from './index.module.css';

export function ThreadRunStatus({ threadId }: { threadId: string }) {
  const status = useRunStore((state) =>
    runStatusIndicator(selectThreadRun(state, threadId).status),
  );
  if (!status) return null;

  switch (status) {
    case 'running':
      return (
        <span className={`${styles.status} ${styles.running}`} aria-label="运行中" role="status">
          <LoaderCircle aria-hidden="true" size={14} />
        </span>
      );
    case 'approval':
      return (
        <span className={`${styles.status} ${styles.approval}`} aria-label="等待审核" role="status">
          <ShieldAlert aria-hidden="true" size={14} />
        </span>
      );
    case 'failed':
      return (
        <span className={`${styles.status} ${styles.failed}`} aria-label="运行失败" role="status">
          <CircleAlert aria-hidden="true" size={14} />
        </span>
      );
    default:
      return null;
  }
}
