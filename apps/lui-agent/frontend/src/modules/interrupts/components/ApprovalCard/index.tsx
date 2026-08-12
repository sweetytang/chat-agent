import { useState } from 'react';

import { resolveInterrupt } from '@/modules/interrupts/services/interruptApi';
import { activateStream, clearActiveStream } from '@/modules/runs/domain/activeStream';
import { createFrameEventDispatcher } from '@/modules/runs/domain/frameEventDispatcher';
import { streamAgentEvents } from '@/modules/runs/services/sse/client';
import { useRunStore } from '@/modules/runs/store/run';
import { RunStatus } from '@/modules/runs/types/events';
import { useThreadStore } from '@/modules/threads/store/thread';
import { API_ROOT } from '@/shared/http/client';

import styles from './index.module.css';

export function ApprovalCard({
  requestId,
  runId,
  tool,
  active = true,
}: {
  requestId: string;
  runId: string;
  tool: string;
  active?: boolean;
}) {
  const [isResolving, setIsResolving] = useState(false);
  async function resolve(decision: 'approve' | 'edit' | 'reject') {
    setIsResolving(true);
    let streamController: AbortController | null = null;
    const eventDispatcher = createFrameEventDispatcher((event) =>
      useRunStore.getState().applyEvent(event),
    );
    try {
      await resolveInterrupt(requestId, decision);
      useRunStore.getState().prepareResume();
      streamController = new AbortController();
      activateStream(streamController);
      for await (const event of streamAgentEvents({
        url: `${API_ROOT}/runs/${runId}/resume`,
        body: { request_id: requestId, decision },
        signal: streamController.signal,
      })) {
        eventDispatcher.push(event);
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError'))
        useRunStore.setState({
          error: error instanceof Error ? error.message : '审核恢复失败',
          status: RunStatus.Failed,
        });
    } finally {
      if (streamController?.signal.aborted) eventDispatcher.cancel();
      else eventDispatcher.flush();
      if (streamController) clearActiveStream(streamController);
      await useThreadStore.getState().refreshCurrentThread(true);
      await useThreadStore.getState().loadThreads();
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
