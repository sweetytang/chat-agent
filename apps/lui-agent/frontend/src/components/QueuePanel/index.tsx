import { useRunStore } from "@/store/run";
import styles from "./index.module.css";

export function QueuePanel() {
  const status = useRunStore((state) => state.status);
  if (status === "idle" || status === "completed") return null;
  return <div className={styles.panel}>当前运行：<strong>{status}</strong></div>;
}
