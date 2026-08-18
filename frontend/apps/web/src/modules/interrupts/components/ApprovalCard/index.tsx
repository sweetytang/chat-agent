import { useState } from 'react';

import { useAuthStore } from '@/modules/auth/store/auth';
import { resolveInterrupt } from '@/modules/interrupts/services/interruptApi';
import { consumeRunStream } from '@/modules/runs/domain/runStream';
import { isActiveRunStatus } from '@/modules/runs/domain/status';
import { selectThreadRun, useRunStore } from '@/modules/runs/store/run';
import { RunStatus } from '@/modules/runs/types/events';
import { useThreadStore } from '@/modules/threads/store/thread';
import { API_ROOT } from '@/shared/http/client';

import styles from './index.module.css';

export function ApprovalCard({
  requestId,
  runId,
  threadId,
  tool,
  active = true,
}: {
  requestId: string;
  runId: string;
  threadId: string;
  tool: string;
  active?: boolean;
}) {
  const [isResolving, setIsResolving] = useState(false);
  async function resolve(decision: 'approve' | 'edit' | 'reject') {
    if (!useAuthStore.getState().token) return;
    setIsResolving(true);
    useRunStore.getState().prepareResume(threadId);
    try {
      await resolveInterrupt(requestId, decision);
      // 审核提交期间可能退出登录或停止该会话，此时不能再启动恢复流。
      const currentRun = selectThreadRun(useRunStore.getState(), threadId);
      if (
        !useAuthStore.getState().token ||
        currentRun.runId !== runId ||
        currentRun.status !== RunStatus.Resuming
      )
        return;
      await consumeRunStream({
        threadId,
        url: `${API_ROOT}/runs/${runId}/resume`,
        body: { request_id: requestId, decision },
        onEvent: (event) => useRunStore.getState().applyEvent(event),
      });
    } catch (error) {
      const currentRun = selectThreadRun(useRunStore.getState(), threadId);
      if (
        useAuthStore.getState().token &&
        currentRun.runId === runId &&
        isActiveRunStatus(currentRun.status)
      )
        useRunStore
          .getState()
          .setRunError(
            threadId,
            error instanceof Error ? error.message : '审核恢复失败',
            RunStatus.Failed,
          );
    } finally {
      const currentRun = selectThreadRun(useRunStore.getState(), threadId);
      if (useAuthStore.getState().token && currentRun.runId === runId) {
        await useThreadStore.getState().refreshThread(threadId, true);
        await useThreadStore.getState().loadThreads();
      }
      setIsResolving(false);
    }
  }
  return (
    <section className={styles.card} aria-label={`工具审核：${tool}`}>
      <strong>
        {isResolving ? '正在恢复运行…' : active ? `工具需要审核：${tool}` : `工具审核：${tool}`}
      </strong>
      <div className={styles.actions} aria-label="审核操作">
        <button
          disabled={!active || isResolving}
          onClick={() => void resolve('approve')}
          type="button"
        >
          批准
        </button>
        <button
          disabled={!active || isResolving}
          onClick={() => void resolve('edit')}
          type="button"
        >
          编辑
        </button>
        <button
          disabled={!active || isResolving}
          onClick={() => void resolve('reject')}
          type="button"
        >
          拒绝
        </button>
      </div>
    </section>
  );
}
