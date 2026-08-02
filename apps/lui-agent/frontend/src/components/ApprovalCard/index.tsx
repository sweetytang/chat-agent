import { useState } from "react";
import { api } from "@/services/api";
import { streamAgentEvents } from "@/services/sse/client";
import { useRunStore } from "@/store/run";
import styles from "./index.module.css";

export function ApprovalCard({ requestId, runId, tool }: { requestId: string; runId: string; tool: string }) {
  const [resolved, setResolved] = useState<string | null>(null);
  async function resolve(decision: "approve" | "edit" | "reject") {
    await api.resolveInterrupt(requestId, decision);
    setResolved(decision);
    for await (const event of streamAgentEvents({ url: `http://localhost:8000/api/runs/${runId}/resume`, body: { request_id: requestId, decision } })) useRunStore.getState().applyEvent(event);
  }
  if (resolved) return <div className={styles.card}>已{resolved === "approve" ? "批准" : resolved === "reject" ? "拒绝" : "编辑"}</div>;
  return <div className={styles.card}><strong>工具需要审核：{tool}</strong><div><button onClick={() => void resolve("approve")} type="button">批准</button><button onClick={() => void resolve("edit")} type="button">编辑</button><button onClick={() => void resolve("reject")} type="button">拒绝</button></div></div>;
}
