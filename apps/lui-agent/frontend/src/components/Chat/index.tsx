import { FormEvent, useEffect, useRef, useState } from "react";
import { streamAgentEvents } from "@/services/sse/client";
import { useRunStore } from "@/store/run";
import { useThreadStore } from "@/store/thread";
import { Sidebar } from "@/components/Sidebar";
import { QueuePanel } from "@/components/QueuePanel";
import { ApprovalCard } from "@/components/ApprovalCard";
import { BranchSwitcher } from "@/components/BranchSwitcher";
import { AuthPanel } from "@/components/AuthPanel";
import { MessageContent } from "@/components/MessageContent";
import { StructuredOutputCard } from "@/components/StructuredOutputCard";
import { GenerativeUICard } from "@/components/GenerativeUICard";
import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth";
import styles from "./index.module.css";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api/runs/stream";
const API_BASE_URL = API_URL.replace(/\/api\/runs\/stream$/, "");

export function Chat() {
  const [input, setInput] = useState("");
  const controller = useRef<AbortController | null>(null);
  const threadId = useThreadStore((state) => state.threadId);
  const currentCheckpointId = useThreadStore((state) => state.currentCheckpointId);
  const token = useAuthStore((state) => state.token);
  const { messages, status, error, reasoning, structuredOutput, generativeUi, toolResults, pendingApproval, applyEvent, addUserMessage, setHistory } = useRunStore();

  useEffect(() => {
    if (!token || threadId === "demo-thread") return;
    void api.listMessages(threadId).then((history) => setHistory(history.map((message) => ({
      id: message.id,
      role: message.role === "user" ? "user" : "assistant",
      content: typeof message.content.content === "string" ? message.content.content : JSON.stringify(message.content),
      createdAt: new Date().toISOString(),
    }))));
  }, [setHistory, threadId, token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const content = input.trim();
    if (!content || status === "running" || status === "queued") return;
    setInput("");
    addUserMessage(content);
    controller.current?.abort();
    controller.current = new AbortController();
    try {
      for await (const agentEvent of streamAgentEvents({ url: API_URL, body: { thread_id: threadId, content, checkpoint_id: currentCheckpointId }, signal: controller.current.signal })) applyEvent(agentEvent);
    } catch (streamError) {
      if (!(streamError instanceof DOMException && streamError.name === "AbortError")) useRunStore.setState({ error: streamError instanceof Error ? streamError.message : "连接失败", status: "failed" });
    }
  }

  async function cancel() {
    const runId = useRunStore.getState().runId;
    if (!runId) return;
    await fetch(`${API_BASE_URL}/api/runs/${runId}/cancel`, { method: "POST" });
  }

  return <div className={styles.shell}><Sidebar /><main className={styles.page}>
    <AuthPanel />
    <header className={styles.header}><h1>LUI Agent</h1><p>FastAPI + LangGraph 对话工作台</p><BranchSwitcher /></header>
    <QueuePanel />
    <section className={styles.messages} aria-live="polite">
      {messages.length === 0 ? <p className={styles.empty}>输入消息，开始一次新的 Agent 运行。</p> : messages.map((message) => <article className={`${styles.message} ${message.role === "user" ? styles.user : styles.assistant}`} key={message.id}>{message.content ? <MessageContent content={message.content} /> : "…"}</article>)}
      {reasoning && <aside className={styles.reasoning}><strong>思考摘要</strong><p>{reasoning}</p></aside>}
      {toolResults.map((result, index) => <pre className={styles.payload} key={`${result.tool}-${index}`}>{result.tool}\n{JSON.stringify(result.content, null, 2)}</pre>)}
      {structuredOutput && <StructuredOutputCard value={structuredOutput} />}
      {generativeUi && <GenerativeUICard value={generativeUi} />}
      {pendingApproval?.requestId && <ApprovalCard requestId={pendingApproval.requestId} runId={pendingApproval.runId} tool={pendingApproval.tool} />}
    </section>
    <div className={`${styles.status} ${error ? styles.error : ""}`}>
      {error ?? (status === "idle" ? "就绪" : `运行状态：${status}`)}
      {(status === "running" || status === "queued") && <button className={styles.cancel} onClick={cancel} type="button">取消运行</button>}
    </div>
    <form className={styles.composer} onSubmit={submit}><textarea className={styles.input} value={input} onChange={(event) => setInput(event.target.value)} placeholder="输入消息…（支持 calc: 1 + 2、json: 内容、ui: 内容）" aria-label="消息" /><button className={styles.button} disabled={!input.trim() || status === "running" || status === "queued"} type="submit">发送</button></form>
  </main></div>;
}
