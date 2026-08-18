import { CheckCircle2, CircleX, LoaderCircle, Wrench } from 'lucide-react';

import type { ToolItem } from '@/modules/timeline/types';

import styles from './index.module.css';

const LABELS: Record<ToolItem['status'], string> = {
  running: '执行中',
  awaiting_approval: '等待审核',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

export function ToolCallCard({
  item,
  approvalActive,
  approvalResolving,
  onApproval,
}: {
  item: ToolItem;
  approvalActive: boolean;
  approvalResolving: boolean;
  onApproval: (requestId: string, runId: string, decision: 'approve' | 'edit' | 'reject') => void;
}) {
  const StatusIcon =
    item.status === 'completed'
      ? CheckCircle2
      : item.status === 'failed' || item.status === 'cancelled'
        ? CircleX
        : LoaderCircle;

  return (
    <section className={styles.card} aria-label={`工具：${item.tool}`}>
      <header className={styles.header}>
        <span>
          <Wrench size={17} />
          <strong>{item.tool}</strong>
        </span>
        <span className={styles.status}>
          <StatusIcon size={15} />
          {LABELS[item.status]}
        </span>
      </header>
      {Object.keys(item.arguments).length > 0 && (
        <pre className={styles.payload}>{JSON.stringify(item.arguments, null, 2)}</pre>
      )}
      {item.result !== null && (
        <pre className={styles.payload}>{JSON.stringify(item.result, null, 2)}</pre>
      )}
      {item.status === 'awaiting_approval' && item.request_id && item.run_id && (
        <div className={styles.approval} aria-label={`工具审核：${item.tool}`}>
          <strong>
            {approvalResolving
              ? '正在恢复运行…'
              : approvalActive
                ? `工具需要审核：${item.tool}`
                : `工具审核：${item.tool}`}
          </strong>
          <div className={styles.actions} aria-label="审核操作">
            {(['approve', 'edit', 'reject'] as const).map((decision) => (
              <button
                disabled={!approvalActive || approvalResolving}
                key={decision}
                onClick={() => onApproval(item.request_id!, item.run_id!, decision)}
                type="button"
              >
                {{ approve: '批准', edit: '编辑', reject: '拒绝' }[decision]}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
