import type { ReactNode } from 'react';

import { InlineErrorCard } from '@/modules/chat/components/InlineErrorCard';
import { MessageBubble } from '@/modules/chat/components/MessageBubble';
import { GenerativeUICard } from '@/modules/presentation/components/GenerativeUICard';
import { StructuredOutputCard } from '@/modules/presentation/components/StructuredOutputCard';
import { ReasoningBlock } from '@/modules/timeline/components/ReasoningBlock';
import { TimelineBranchControls } from '@/modules/timeline/components/TimelineBranchControls';
import { ToolCallCard } from '@/modules/timeline/components/ToolCallCard';
import type { MessageItem, TimelineItem, TimelineSnapshot } from '@/modules/timeline/types';

import styles from './index.module.css';

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : { value };
}

function assertNever(item: never): never {
  throw new Error(`未知时间线条目：${JSON.stringify(item)}`);
}

export function ChatTimeline({
  timeline,
  active,
  controlsDisabled,
  pendingRequestId,
  canRetry,
  loading,
  empty,
  onBranchSwitch,
  onEdit,
  onRegenerate,
  onRetry,
  onResolveApproval,
  resolvingApprovalId,
}: {
  timeline: TimelineSnapshot;
  active: boolean;
  controlsDisabled: boolean;
  pendingRequestId: string | null;
  canRetry: boolean;
  loading: boolean;
  empty: ReactNode;
  onBranchSwitch: (checkpointId: string) => void;
  onEdit: (message: MessageItem, content: string) => void;
  onRegenerate: (message: MessageItem) => void;
  onRetry: () => void;
  onResolveApproval: (
    requestId: string,
    runId: string,
    decision: 'approve' | 'edit' | 'reject',
  ) => void;
  resolvingApprovalId: string | null;
}) {
  if (loading && timeline.items.length === 0)
    return (
      <div className={styles.loading} aria-label="正在加载会话" aria-live="polite" role="status">
        <span className={styles.loadingBar} />
        <span className={styles.loadingBar} />
        <span className={styles.loadingBar} />
      </div>
    );
  if (timeline.items.length === 0 && !active) return empty;

  function renderItem(item: TimelineItem) {
    switch (item.kind) {
      case 'message':
        return (
          <MessageBubble
            disabled={controlsDisabled}
            message={item}
            onBranchSwitch={onBranchSwitch}
            onEdit={onEdit}
            onRegenerate={onRegenerate}
          />
        );
      case 'reasoning':
        return <ReasoningBlock item={item} />;
      case 'tool':
        return (
          <ToolCallCard
            approvalActive={pendingRequestId === item.request_id}
            approvalResolving={resolvingApprovalId === item.request_id}
            item={item}
            onApproval={onResolveApproval}
          />
        );
      case 'structured_output':
        return <StructuredOutputCard value={recordValue(item.value)} />;
      case 'generative_ui':
        return <GenerativeUICard value={recordValue(item.value)} />;
      case 'error':
        return <InlineErrorCard canRetry={canRetry} message={item.message} onRetry={onRetry} />;
      default:
        return assertNever(item);
    }
  }

  return (
    <>
      {timeline.items.map((item) => (
        <div className={styles.item} key={item.id}>
          {renderItem(item)}
          {item.kind !== 'message' && (
            <TimelineBranchControls
              disabled={controlsDisabled}
              item={item}
              onSwitch={onBranchSwitch}
            />
          )}
        </div>
      ))}
      {active && !timeline.items.some((item) => item.status === 'streaming') && (
        <div className={styles.waiting} role="status">
          <span className={styles.waitingDot} />
          <span className={styles.waitingDot} />
          <span className={styles.waitingDot} />
          正在处理
        </div>
      )}
    </>
  );
}
