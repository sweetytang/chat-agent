import { useEffect } from "react";
import { useThreadStore } from "@/store/thread";
import { useAuthStore } from "@/store/auth";
import { api } from "@/services/api";
import styles from "./index.module.css";

export function Sidebar() {
  const { threads, threadId, setThread, loadThreads } = useThreadStore();
  const token = useAuthStore((state) => state.token);
  async function createThread() {
    if (!token) { setThread("demo-thread", "新对话"); return; }
    try {
      const thread = await api.createThread("新对话");
      setThread(thread.id, thread.title ?? "新对话");
      await loadThreads();
    } catch { /* 登录失效时保留演示线程，仍可继续测试模型链路。 */ }
  }
  useEffect(() => { if (token) void loadThreads(); }, [token, loadThreads]);
  return <aside className={styles.sidebar} aria-label="线程列表">
    <div className={styles.heading}><h2>会话</h2><button onClick={() => void createThread()} type="button">新建</button></div>
    {threads.length === 0 ? <p className={styles.empty}>暂无已保存会话</p> : threads.map((thread) => <button className={`${styles.item} ${thread.id === threadId ? styles.active : ""}`} key={thread.id} onClick={() => setThread(thread.id, thread.title ?? "新对话")} type="button">{thread.title ?? "未命名会话"}</button>)}
  </aside>;
}
