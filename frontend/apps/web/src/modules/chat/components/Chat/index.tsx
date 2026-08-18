import { Brain, Wrench } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { AppShell } from '@/app/components/AppShell';
import { useAuthStore } from '@/modules/auth/store/auth';
import { ChatComposer } from '@/modules/chat/components/ChatComposer';
import { InlineErrorCard } from '@/modules/chat/components/InlineErrorCard';
import { MessageBubble } from '@/modules/chat/components/MessageBubble';
import { WelcomePanel } from '@/modules/chat/components/WelcomePanel';
import {
  findPreviousUserContent,
  historyBeforeMessage,
} from '@/modules/checkpoints/domain/history';
import { ApprovalCard } from '@/modules/interrupts/components/ApprovalCard';
import { GenerativeUICard } from '@/modules/presentation/components/GenerativeUICard';
import { StructuredOutputCard } from '@/modules/presentation/components/StructuredOutputCard';
import { abortActiveStream, abortAllStreams } from '@/modules/runs/domain/activeStream';
import { consumeRunStream } from '@/modules/runs/domain/runStream';
import { isActiveRunStatus } from '@/modules/runs/domain/status';
import { stopRun } from '@/modules/runs/domain/stopRun';
import { cancelRun, RUN_STREAM_URL } from '@/modules/runs/services/runApi';
import { selectThreadRun, useRunStore, type RunRequestContext } from '@/modules/runs/store/run';
import { RunStatus } from '@/modules/runs/types/events';
import { useThreadStore } from '@/modules/threads/store/thread';
import type { HistoryMessage, RunStreamRequest } from '@/modules/threads/types/history';

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
  const submitLockRef = useRef(false);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const threadId = useThreadStore((state) => state.threadId);
  const isRefreshing = useThreadStore((state) => Boolean(state.refreshingThreads[threadId]));
  const token = useAuthStore((state) => state.token);
  const {
    history,
    status,
    error,
    reasoning,
    presentationItems,
    pendingApproval,
    lastRequest
  } = useRunStore((state) => selectThreadRun(state, threadId));
  const active = isActiveRunStatus(status);
  const controlsDisabled = active || isRefreshing || isSubmitting;

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
      options.baseHistory,
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

  function editMessage(message: HistoryMessage, content: string) {
    const targetThreadId = threadId;
    const currentHistory = selectThreadRun(useRunStore.getState(), targetThreadId).history;
    void startRun({
      content,
      checkpointId: message.parent_checkpoint_id,
      mode: 'edit',
      showUserMessage: true,
      baseHistory: historyBeforeMessage(currentHistory, message.id),
      threadId: targetThreadId,
    });
  }

  function regenerateMessage(message: HistoryMessage) {
    const targetThreadId = threadId;
    const currentHistory = selectThreadRun(useRunStore.getState(), targetThreadId).history;
    const content = findPreviousUserContent(currentHistory, message.id);
    if (!content) {
      useRunStore.getState().setRunError(targetThreadId, '找不到该回复对应的用户消息');
      return;
    }
    void startRun({
      content,
      checkpointId: message.parent_checkpoint_id,
      mode: 'regenerate',
      baseHistory: historyBeforeMessage(currentHistory, message.id),
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

  function fillPrompt(prompt: string) {
    setInput(prompt);
    setTimeout(() => composerRef.current?.focus(), 0);
  }

  return (
    <AppShell>
      <main className={styles.page}>
        <section className={styles.scroll} aria-live="polite">
          <div className={styles.messages}>
            {isRefreshing && history.length === 0 ? (
              <div
                className={styles.chatLoading}
                aria-label="正在加载会话"
                aria-live="polite"
                role="status"
              >
                <span className={styles.loadingLine} />
                <span className={styles.loadingLine} />
                <span className={styles.loadingLine} />
              </div>
            ) : history.length === 0 && !active ? (
              <WelcomePanel authenticated={Boolean(token)} onPrompt={fillPrompt} />
            ) : (
              history.map((message) => (
                <MessageBubble
                  disabled={controlsDisabled}
                  key={message.id}
                  message={message}
                  onBranchSwitch={(checkpointId) =>
                    void useThreadStore.getState().switchCheckpoint(checkpointId)
                  }
                  onEdit={editMessage}
                  onRegenerate={regenerateMessage}
                />
              ))
            )}
            {active && history.at(-1)?.role !== 'assistant' && (
              <div className={styles.waiting}>
                <span />
                <span />
                <span />
                正在思考
              </div>
            )}
            {reasoning && (
              <aside className={styles.reasoning}>
                <Brain size={17} />
                <div>
                  <strong>思考摘要</strong>
                  <p>{reasoning}</p>
                </div>
              </aside>
            )}
            {presentationItems.map((item) => {
              if (item.kind === 'structured-output')
                return <StructuredOutputCard key={item.id} value={item.data} />;
              if (item.kind === 'generative-ui')
                return <GenerativeUICard key={item.id} value={item.data} />;
              if (item.kind === 'tool-result')
                return (
                  <section className={styles.toolCard} key={item.id}>
                    <Wrench size={17} />
                    <div>
                      <strong>
                        {typeof item.data.tool === 'string' ? item.data.tool : '工具结果'}
                      </strong>
                      <pre>{JSON.stringify(item.data.content, null, 2)}</pre>
                    </div>
                  </section>
                );
              if (item.kind === 'approval') {
                const requestId =
                  typeof item.data.request_id === 'string' ? item.data.request_id : '';
                const tool = typeof item.data.tool === 'string' ? item.data.tool : '工具';
                return (
                  <ApprovalCard
                    active={pendingApproval?.requestId === requestId}
                    key={item.id}
                    requestId={requestId}
                    runId={item.runId}
                    threadId={threadId}
                    tool={tool}
                  />
                );
              }
              if (item.kind === 'error')
                return (
                  <InlineErrorCard
                    key={item.id}
                    message={typeof item.data.error === 'string' ? item.data.error : '运行失败'}
                    canRetry={!!lastRequest && !active}
                    onRetry={() => {
                      if (lastRequest) void startRun(lastRequest);
                    }}
                  />
                );
              return null;
            })}
            {pendingApproval?.requestId &&
              !presentationItems.some(
                (item) =>
                  item.kind === 'approval' && item.data.request_id === pendingApproval.requestId,
              ) && (
                <ApprovalCard
                  requestId={pendingApproval.requestId}
                  runId={pendingApproval.runId}
                  threadId={threadId}
                  tool={pendingApproval.tool}
                />
              )}
            {error && !presentationItems.some((item) => item.kind === 'error') && (
              <InlineErrorCard
                message={error}
                canRetry={!!lastRequest && !active}
                onRetry={() => {
                  if (lastRequest) void startRun(lastRequest);
                }}
              />
            )}
          </div>
        </section>
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
