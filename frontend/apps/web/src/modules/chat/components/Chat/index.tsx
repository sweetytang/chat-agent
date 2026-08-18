import { useEffect, useRef, useState } from 'react';

import { AppShell } from '@/app/components/AppShell';
import { useAuthStore } from '@/modules/auth/store/auth';
import { ChatComposer } from '@/modules/chat/components/ChatComposer';
import { WelcomePanel } from '@/modules/chat/components/WelcomePanel';
import { resolveInterrupt } from '@/modules/interrupts/services/interruptApi';
import { abortActiveStream, abortAllStreams } from '@/modules/runs/domain/activeStream';
import { consumeRunStream } from '@/modules/runs/domain/runStream';
import { isActiveRunStatus } from '@/modules/runs/domain/status';
import { stopRun } from '@/modules/runs/domain/stopRun';
import { cancelRun, RUN_STREAM_URL } from '@/modules/runs/services/runApi';
import { selectThreadRun, useRunStore, type RunRequestContext } from '@/modules/runs/store/run';
import { RunStatus } from '@/modules/runs/types/events';
import { ChatTimeline } from '@/modules/timeline/components/ChatTimeline';
import {
  findPreviousUserContent,
  timelineBeforeAssistantAttempt,
  timelineBeforeItem,
} from '@/modules/timeline/domain/conversation';
import { useSmartScroll } from '@/modules/timeline/domain/useSmartScroll';
import type { MessageItem, RunStreamRequest } from '@/modules/timeline/types';
import { useThreadStore } from '@/modules/threads/store/thread';
import { API_ROOT } from '@/shared/http/client';

import styles from './index.module.css';

function ownsRunRequest(request: RunRequestContext): boolean {
  return (
    Boolean(useAuthStore.getState().token) &&
    selectThreadRun(useRunStore.getState(), request.threadId).lastRequest === request
  );
}

export function Chat() {
  const [input, setInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resolvingApprovalId, setResolvingApprovalId] = useState<string | null>(null);
  const submitLockRef = useRef(false);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLElement | null>(null);

  const threadId = useThreadStore((state) => state.threadId);
  const isRefreshing = useThreadStore((state) => Boolean(state.refreshingThreads[threadId]));
  const token = useAuthStore((state) => state.token);
  const { timeline, status, pendingApproval, lastRequest } = useRunStore((state) =>
    selectThreadRun(state, threadId),
  );
  const active = isActiveRunStatus(status);
  const controlsDisabled = active || isRefreshing || isSubmitting;
  const { hasNewContent, scrollToBottom } = useSmartScroll(scrollRef, timeline, threadId);

  useEffect(() => {
    window.addEventListener('beforeunload', abortAllStreams);
    return () => {
      window.removeEventListener('beforeunload', abortAllStreams);
      abortAllStreams();
    };
  }, []);

  async function startRun(options: RunRequestContext) {
    if (!useAuthStore.getState().token) return;
    const request: RunStreamRequest = {
      thread_id: options.threadId,
      content: options.content,
      checkpoint_id: options.checkpointId,
      mode: options.mode,
    };
    const runStore = useRunStore.getState();
    runStore.setLastRequest(options.threadId, options);
    runStore.beginRun(
      options.threadId,
      options.showUserMessage ? options.content : undefined,
      options.baseTimeline,
    );
    try {
      await consumeRunStream({
        threadId: options.threadId,
        url: RUN_STREAM_URL,
        body: request,
        onEvent: (event) => useRunStore.getState().applyEvent(event),
      });
    } catch (streamError) {
      if (ownsRunRequest(options))
        useRunStore
          .getState()
          .setRunError(
            options.threadId,
            streamError instanceof Error ? streamError.message : '连接失败',
            RunStatus.Failed,
          );
    } finally {
      // 退出登录会清空全部投影；旧流结束后不得用异步刷新重新写回前一账户的数据。
      if (ownsRunRequest(options)) {
        await useThreadStore.getState().refreshThread(options.threadId, true);
        await useThreadStore.getState().loadThreads();
      }
    }
  }

  async function submit() {
    const content = input.trim();
    if (!content || controlsDisabled || !token || submitLockRef.current) return;
    const selectedThread = useThreadStore.getState();
    const isNewThread = selectedThread.threadId === 'demo-thread';

    setInput('');
    submitLockRef.current = true;
    setIsSubmitting(true);
    try {
      if (isNewThread) {
        useRunStore.getState().beginRun('demo-thread', content);
        selectedThread.setCurrentThreadTitle(content);
        const thread = await selectedThread.createThread(content, true);
        if (!thread) {
          // 创建期间用户可能已切换会话并输入新草稿，只在草稿仍为空时恢复失败内容。
          setInput((draft) => draft || content);
          useRunStore.getState().resetThread('demo-thread');
          return;
        }
        void startRun({
          content,
          checkpointId: thread.current_checkpoint_id,
          mode: 'send',
          threadId: thread.id,
        });
        return;
      }

      void startRun({
        content,
        checkpointId: selectedThread.currentCheckpointId,
        mode: 'send',
        showUserMessage: true,
        threadId: selectedThread.threadId,
      });
    } finally {
      submitLockRef.current = false;
      setIsSubmitting(false);
    }
  }

  function editMessage(message: MessageItem, content: string) {
    const targetThreadId = threadId;
    const currentTimeline = selectThreadRun(useRunStore.getState(), targetThreadId).timeline;
    void startRun({
      content,
      checkpointId: message.parent_checkpoint_id ?? null,
      mode: 'edit',
      showUserMessage: true,
      baseTimeline: timelineBeforeItem(currentTimeline, message.id),
      threadId: targetThreadId,
    });
  }

  function regenerateMessage(message: MessageItem) {
    const targetThreadId = threadId;
    const currentTimeline = selectThreadRun(useRunStore.getState(), targetThreadId).timeline;
    const content = findPreviousUserContent(currentTimeline.items, message.id);
    if (!content) {
      useRunStore.getState().setRunError(targetThreadId, '找不到该回复对应的用户消息');
      return;
    }
    void startRun({
      content,
      checkpointId: message.parent_checkpoint_id ?? null,
      mode: 'regenerate',
      baseTimeline: timelineBeforeAssistantAttempt(currentTimeline, message.id),
      threadId: targetThreadId,
    });
  }

  async function stop() {
    const targetThreadId = threadId;
    const runId = selectThreadRun(useRunStore.getState(), targetThreadId).runId;
    useRunStore.getState().markCancelled(targetThreadId);
    try {
      await stopRun(() => abortActiveStream(targetThreadId), runId, cancelRun);
    } catch (cancelError) {
      useRunStore
        .getState()
        .setRunError(
          targetThreadId,
          cancelError instanceof Error ? cancelError.message : '取消运行失败',
        );
    }
  }

  async function resolveApproval(
    requestId: string,
    runId: string,
    decision: 'approve' | 'edit' | 'reject',
  ) {
    if (!useAuthStore.getState().token) return;
    const targetThreadId = threadId;
    setResolvingApprovalId(requestId);
    useRunStore.getState().prepareResume(targetThreadId);
    try {
      await resolveInterrupt(requestId, decision);
      const currentRun = selectThreadRun(useRunStore.getState(), targetThreadId);
      if (
        !useAuthStore.getState().token ||
        currentRun.runId !== runId ||
        currentRun.status !== RunStatus.Resuming
      )
        return;
      await consumeRunStream({
        threadId: targetThreadId,
        url: `${API_ROOT}/runs/${runId}/resume`,
        body: { request_id: requestId, decision },
        onEvent: (event) => useRunStore.getState().applyEvent(event),
      });
    } catch (error) {
      const currentRun = selectThreadRun(useRunStore.getState(), targetThreadId);
      if (
        useAuthStore.getState().token &&
        currentRun.runId === runId &&
        isActiveRunStatus(currentRun.status)
      )
        useRunStore
          .getState()
          .setRunError(
            targetThreadId,
            error instanceof Error ? error.message : '审核恢复失败',
            RunStatus.Failed,
          );
    } finally {
      const currentRun = selectThreadRun(useRunStore.getState(), targetThreadId);
      if (useAuthStore.getState().token && currentRun.runId === runId) {
        await useThreadStore.getState().refreshThread(targetThreadId, true);
        await useThreadStore.getState().loadThreads();
      }
      setResolvingApprovalId((current) => (current === requestId ? null : current));
    }
  }

  function fillPrompt(prompt: string) {
    setInput(prompt);
    setTimeout(() => composerRef.current?.focus(), 0);
  }

  return (
    <AppShell>
      <main className={styles.page}>
        <section className={styles.scroll} aria-live="polite" ref={scrollRef}>
          <div className={styles.messages}>
            <ChatTimeline
              active={active}
              canRetry={!!lastRequest && !active}
              controlsDisabled={controlsDisabled}
              empty={<WelcomePanel authenticated={Boolean(token)} onPrompt={fillPrompt} />}
              loading={isRefreshing}
              onBranchSwitch={(checkpointId) =>
                void useThreadStore.getState().switchCheckpoint(checkpointId)
              }
              onEdit={editMessage}
              onRegenerate={regenerateMessage}
              onResolveApproval={(requestId, runId, decision) =>
                void resolveApproval(requestId, runId, decision)
              }
              onRetry={() => {
                if (lastRequest) void startRun(lastRequest);
              }}
              pendingRequestId={pendingApproval?.requestId ?? null}
              resolvingApprovalId={resolvingApprovalId}
              timeline={timeline}
            />
          </div>
        </section>
        {hasNewContent && (
          <button className={styles.newContent} onClick={scrollToBottom} type="button">
            有新内容 · 回到底部
          </button>
        )}
        <div className={styles.composerDock}>
          <ChatComposer
            ref={composerRef}
            value={input}
            disabled={!token || isRefreshing}
            running={active}
            onChange={setInput}
            onSubmit={() => void submit()}
            onStop={() => void stop()}
          />
        </div>
      </main>
    </AppShell>
  );
}
