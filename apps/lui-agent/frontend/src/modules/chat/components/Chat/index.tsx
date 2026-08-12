import { Brain, Wrench } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { AppShell } from '@/app/components/AppShell';
import { useAuthStore } from '@/modules/auth/store/auth';
import { ChatComposer } from '@/modules/chat/components/ChatComposer';
import { InlineErrorCard } from '@/modules/chat/components/InlineErrorCard';
import { MessageBubble } from '@/modules/chat/components/MessageBubble';
import { WelcomePanel } from '@/modules/chat/components/WelcomePanel';
import { ACTIVE_RUN_STATUSES } from '@/modules/chat/type';
import {
  findPreviousUserContent,
  historyBeforeMessage,
} from '@/modules/checkpoints/domain/history';
import { ApprovalCard } from '@/modules/interrupts/components/ApprovalCard';
import { GenerativeUICard } from '@/modules/presentation/components/GenerativeUICard';
import { StructuredOutputCard } from '@/modules/presentation/components/StructuredOutputCard';
import {
  abortActiveStream,
  activateStream,
  clearActiveStream,
} from '@/modules/runs/domain/activeStream';
import { createFrameEventDispatcher } from '@/modules/runs/domain/frameEventDispatcher';
import { stopRun } from '@/modules/runs/domain/stopRun';
import { cancelRun, RUN_STREAM_URL } from '@/modules/runs/services/runApi';
import { streamAgentEvents } from '@/modules/runs/services/sse/client';
import { useRunStore } from '@/modules/runs/store/run';
import { RunStatus } from '@/modules/runs/types/events';
import { useThreadStore } from '@/modules/threads/store/thread';
import type { HistoryMessage, RunMode, RunStreamRequest } from '@/modules/threads/types/history';

import styles from './index.module.css';

interface StartRunOptions {
  content: string;
  checkpointId: string | null;
  mode: RunMode;
  showUserMessage?: boolean;
  baseHistory?: HistoryMessage[];
  threadId?: string;
}

export function Chat() {
  const [input, setInput] = useState('');
  const [canRetry, setCanRetry] = useState(false);
  const [creatingThread, setCreatingThread] = useState(false);
  const creatingThreadRef = useRef(false);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const lastRequest = useRef<StartRunOptions | null>(null);
  const threadId = useThreadStore((state) => state.threadId);
  const isRefreshing = useThreadStore((state) => state.isRefreshing);
  const token = useAuthStore((state) => state.token);
  const history = useRunStore((state) => state.history);
  const status = useRunStore((state) => state.status);
  const error = useRunStore((state) => state.error);
  const reasoning = useRunStore((state) => state.reasoning);
  const presentationItems = useRunStore((state) => state.presentationItems);
  const pendingApproval = useRunStore((state) => state.pendingApproval);
  const active = ACTIVE_RUN_STATUSES.has(status);
  const controlsDisabled = active || isRefreshing || creatingThread;

  useEffect(() => {
    abortActiveStream();
    if (token && threadId !== 'demo-thread') {
      const preserveRunState = ACTIVE_RUN_STATUSES.has(useRunStore.getState().status);
      void useThreadStore.getState().refreshCurrentThread(preserveRunState);
    }
    return abortActiveStream;
  }, [threadId, token]);

  async function startRun(options: StartRunOptions) {
    if (!useAuthStore.getState().token) return;
    lastRequest.current = options;
    setCanRetry(true);
    const request: RunStreamRequest = {
      thread_id: options.threadId ?? useThreadStore.getState().threadId,
      content: options.content,
      checkpoint_id: options.checkpointId,
      mode: options.mode,
    };
    const streamController = new AbortController();
    activateStream(streamController);
    const eventDispatcher = createFrameEventDispatcher((event) =>
      useRunStore.getState().applyEvent(event),
    );
    useRunStore
      .getState()
      .beginRun(options.showUserMessage ? options.content : undefined, options.baseHistory);
    try {
      for await (const agentEvent of streamAgentEvents({
        url: RUN_STREAM_URL,
        body: request,
        signal: streamController.signal,
      }))
        eventDispatcher.push(agentEvent);
    } catch (streamError) {
      if (!(streamError instanceof DOMException && streamError.name === 'AbortError'))
        useRunStore.setState({
          error: streamError instanceof Error ? streamError.message : '连接失败',
          status: RunStatus.Failed,
        });
    } finally {
      if (streamController.signal.aborted) eventDispatcher.cancel();
      else eventDispatcher.flush();
      clearActiveStream(streamController);
      if (useThreadStore.getState().threadId === request.thread_id) {
        await useThreadStore.getState().refreshCurrentThread(true);
        await useThreadStore.getState().loadThreads();
      }
    }
  }

  async function submit() {
    const content = input.trim();
    if (!content || controlsDisabled || !token || creatingThreadRef.current) return;
    setInput('');
    creatingThreadRef.current = true;
    setCreatingThread(true);
    try {
      const currentThread = useThreadStore.getState();
      const isNewThread = currentThread.threadId === 'demo-thread';
      if (isNewThread) {
        useRunStore.getState().beginRun(content);
        currentThread.setCurrentThreadTitle(content);
        const thread = await currentThread.createThread(content, true);
        if (!thread) {
          setInput(content);
          useRunStore.getState().reset();
          return;
        }
      }
      const target = useThreadStore.getState();
      void startRun({
        content,
        checkpointId: target.currentCheckpointId,
        mode: 'send',
        showUserMessage: !isNewThread,
        threadId: target.threadId,
      });
    } finally {
      creatingThreadRef.current = false;
      setCreatingThread(false);
    }
  }

  function editMessage(message: HistoryMessage, content: string) {
    const currentHistory = useRunStore.getState().history;
    void startRun({
      content,
      checkpointId: message.parent_checkpoint_id,
      mode: 'edit',
      showUserMessage: true,
      baseHistory: historyBeforeMessage(currentHistory, message.id),
    });
  }

  function regenerateMessage(message: HistoryMessage) {
    const currentHistory = useRunStore.getState().history;
    const content = findPreviousUserContent(currentHistory, message.id);
    if (!content) {
      useRunStore.setState({ error: '找不到该回复对应的用户消息' });
      return;
    }
    void startRun({
      content,
      checkpointId: message.parent_checkpoint_id,
      mode: 'regenerate',
      baseHistory: historyBeforeMessage(currentHistory, message.id),
    });
  }

  async function stop() {
    const runId = useRunStore.getState().runId;
    useRunStore.setState({ status: RunStatus.Cancelled, pendingApproval: null });
    if (runId) {
      try {
        await stopRun(abortActiveStream, runId, cancelRun);
      } catch (cancelError) {
        useRunStore.setState({
          error: cancelError instanceof Error ? cancelError.message : '取消运行失败',
        });
      }
    } else abortActiveStream();
  }

  function fillPrompt(prompt: string) {
    setInput(prompt);
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }

  return (
    <AppShell controlsDisabled={controlsDisabled}>
      <main className={styles.page}>
        <section className={styles.scroll} aria-live="polite">
          <div className={styles.messages}>
            {history.length === 0 && !active ? (
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
                    tool={tool}
                  />
                );
              }
              if (item.kind === 'error')
                return (
                  <InlineErrorCard
                    key={item.id}
                    message={typeof item.data.error === 'string' ? item.data.error : '运行失败'}
                    canRetry={canRetry && !active}
                    onRetry={() => {
                      if (lastRequest.current) void startRun(lastRequest.current);
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
                  tool={pendingApproval.tool}
                />
              )}
            {error && !presentationItems.some((item) => item.kind === 'error') && (
              <InlineErrorCard
                message={error}
                canRetry={canRetry && !active}
                onRetry={() => {
                  if (lastRequest.current) void startRun(lastRequest.current);
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
