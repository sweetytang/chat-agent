import { useState } from "react";

import { resolveInterrupt } from "@/modules/interrupts/services/interruptApi";
import { streamAgentEvents } from "@/modules/runs/services/sse/client";
import { useRunStore } from "@/modules/runs/store/run";
import { useThreadStore } from "@/modules/threads/store/thread";
import { API_ROOT } from "@/shared/http/client";
import styles from "./index.module.css";

export function ApprovalCard({ requestId, runId, tool }: { requestId: string; runId: string; tool: string }) {
  const [isResolving, setIsResolving] = useState(false);
  async function resolve(decision: "approve" | "edit" | "reject") {
    setIsResolving(true);
    try {
      await resolveInterrupt(requestId, decision);
      useRunStore.getState().prepareResume();
      for await (const event of streamAgentEvents({
        url: `${API_ROOT}/runs/${runId}/resume`,
        body: { request_id: requestId, decision },
      })) {
        useRunStore.getState().applyEvent(event);
      }
    } catch (error) {
      useRunStore.setState({ error: error instanceof Error ? error.message : "审核恢复失败", status: "failed" });
    } finally {
      await useThreadStore.getState().refreshCurrentThread(true);
      setIsResolving(false);
    }
  }
  return <div className={styles.card}><strong>{isResolving ? "正在恢复运行…" : `工具需要审核：${tool}`}</strong><div><button disabled={isResolving} onClick={() => void resolve("approve")} type="button">批准</button><button disabled={isResolving} onClick={() => void resolve("edit")} type="button">编辑</button><button disabled={isResolving} onClick={() => void resolve("reject")} type="button">拒绝</button></div></div>;
}
