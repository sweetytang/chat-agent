import { useEffect, useRef, useState, type FormEvent } from 'react';

import { AuthPanel } from '@/modules/auth/components/AuthPanel';
import { useAuthStore } from '@/modules/auth/store/auth';
import { MessageBubble } from '@/modules/chat/components/MessageBubble';
import {
  findPreviousUserContent,
  historyBeforeMessage,
} from '@/modules/checkpoints/domain/history';
import { ApprovalCard } from '@/modules/interrupts/components/ApprovalCard';
import { GenerativeUICard } from '@/modules/presentation/components/GenerativeUICard';
import { StructuredOutputCard } from '@/modules/presentation/components/StructuredOutputCard';
import { QueuePanel } from '@/modules/runs/components/QueuePanel';
import { cancelRun, RUN_STREAM_URL } from '@/modules/runs/services/runApi';
import { streamAgentEvents } from '@/modules/runs/services/sse/client';
import { useRunStore } from '@/modules/runs/store/run';
import { Sidebar } from '@/modules/threads/components/Sidebar';
import { useThreadStore } from '@/modules/threads/store/thread';
import type { HistoryMessage, RunMode, RunStreamRequest } from '@/modules/threads/types/history';

import styles from './index.module.css';

const ACTIVE_RUN_STATUSES = new Set(['queued', 'running', 'interrupted', 'resuming']);

interface StartRunOptions {
  content: string;
  checkpointId: string | null;
  mode: RunMode;
  showUserMessage?: boolean;
  baseHistory?: HistoryMessage[];
}

export function Chat() {
  const [input, setInput] = useState('');
  const controller = useRef<AbortController | null>(null);
  const threadId = useThreadStore((state) => state.threadId);
  const currentCheckpointId = useThreadStore((state) => state.currentCheckpointId);
  const isRefreshing = useThreadStore((state) => state.isRefreshing);
  const refreshCurrentThread = useThreadStore((state) => state.refreshCurrentThread);
  const switchCheckpoint = useThreadStore((state) => state.switchCheckpoint);
  const token = useAuthStore((state) => state.token);
  const history = useRunStore((state) => state.history);
  const status = useRunStore((state) => state.status);
  const error = useRunStore((state) => state.error);
  const reasoning = useRunStore((state) => state.reasoning);
  const structuredOutput = useRunStore((state) => state.structuredOutput);
  const generativeUi = useRunStore((state) => state.generativeUi);
  const toolResults = useRunStore((state) => state.toolResults);
  const pendingApproval = useRunStore((state) => state.pendingApproval);
  const applyEvent = useRunStore((state) => state.applyEvent);
  const beginRun = useRunStore((state) => state.beginRun);
  const controlsDisabled = ACTIVE_RUN_STATUSES.has(status) || isRefreshing;

  useEffect(() => {
    controller.current?.abort();
    if (token && threadId !== 'demo-thread') void refreshCurrentThread();
    return () => controller.current?.abort();
  }, [refreshCurrentThread, threadId, token]);

  async function startRun({
    content,
    checkpointId,
    mode,
    showUserMessage = false,
    baseHistory,
  }: StartRunOptions) {
    const request: RunStreamRequest = {
      thread_id: threadId,
      content,
      checkpoint_id: checkpointId,
      mode,
    };
    const streamController = new AbortController();
    controller.current?.abort();
    controller.current = streamController;
    beginRun(showUserMessage ? content : undefined, baseHistory);

    try {
      for await (const agentEvent of streamAgentEvents({
        url: RUN_STREAM_URL,
        body: request,
        signal: streamController.signal,
      })) {
        applyEvent(agentEvent);
      }
    } catch (streamError) {
      if (!(streamError instanceof DOMException && streamError.name === 'AbortError')) {
        useRunStore.setState({
          error: streamError instanceof Error ? streamError.message : '连接失败',
          status: 'failed',
        });
      }
    } finally {
      if (controller.current === streamController) controller.current = null;
      if (useThreadStore.getState().threadId === request.thread_id)
        await refreshCurrentThread(true);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const content = input.trim();
    if (!content || controlsDisabled) return;
    setInput('');
    await startRun({
      content,
      checkpointId: currentCheckpointId,
      mode: 'send',
      showUserMessage: true,
    });
  }

  function editMessage(message: HistoryMessage, content: string) {
    void startRun({
      content,
      checkpointId: message.parent_checkpoint_id,
      mode: 'edit',
      showUserMessage: true,
      baseHistory: historyBeforeMessage(history, message.id),
    });
  }

  function regenerateMessage(message: HistoryMessage) {
    const content = findPreviousUserContent(history, message.id);
    if (!content) {
      useRunStore.setState({ error: '找不到该回复对应的用户消息' });
      return;
    }
    void startRun({
      content,
      checkpointId: message.parent_checkpoint_id,
      mode: 'regenerate',
      baseHistory: historyBeforeMessage(history, message.id),
    });
  }

  async function cancel() {
    const runId = useRunStore.getState().runId;
    if (!runId) return;
    await cancelRun(runId);
  }

  return (
    <div className={styles.shell}>
      <Sidebar disabled={controlsDisabled} />
      <main className={styles.page}>
        <AuthPanel />
        <header className={styles.header}>
          <h1>LUI Agent</h1>
          <p>FastAPI + LangGraph 对话工作台</p>
        </header>
        <QueuePanel />
        <section className={styles.messages} aria-live="polite">
          {history.length === 0 ? (
            <p className={styles.empty}>输入消息，开始一次新的 Agent 运行。</p>
          ) : (
            history.map((message) => (
              <MessageBubble
                disabled={controlsDisabled}
                key={message.id}
                message={message}
                onBranchSwitch={(checkpointId) => void switchCheckpoint(checkpointId)}
                onEdit={editMessage}
                onRegenerate={regenerateMessage}
              />
            ))
          )}
          {reasoning && (
            <aside className={styles.reasoning}>
              <strong>思考摘要</strong>
              <p>{reasoning}</p>
            </aside>
          )}
          {toolResults.map((result, index) => (
            <pre className={styles.payload} key={`${result.tool}-${index}`}>
              {result.tool}\n{JSON.stringify(result.content, null, 2)}
            </pre>
          ))}
          {structuredOutput && <StructuredOutputCard value={structuredOutput} />}
          {generativeUi && <GenerativeUICard value={generativeUi} />}
          {pendingApproval?.requestId && (
            <ApprovalCard
              requestId={pendingApproval.requestId}
              runId={pendingApproval.runId}
              tool={pendingApproval.tool}
            />
          )}
        </section>
        <div className={`${styles.status} ${error ? styles.error : ''}`}>
          {error ?? (status === 'idle' ? '就绪' : `运行状态：${status}`)}
          {(status === 'running' || status === 'queued') && (
            <button className={styles.cancel} onClick={() => void cancel()} type="button">
              取消运行
            </button>
          )}
        </div>
        <form className={styles.composer} onSubmit={(event) => void submit(event)}>
          <textarea
            className={styles.input}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="输入消息…（支持 calc: 1 + 2、json: 内容、ui: 内容）"
            aria-label="消息"
          />
          <button
            className={styles.button}
            disabled={!input.trim() || controlsDisabled}
            type="submit"
          >
            发送
          </button>
        </form>
      </main>
    </div>
  );
}
