import { useEffect } from "react";
import { useThreadStore } from "@/store/thread";
import styles from "./index.module.css";

export function BranchSwitcher() {
  const { checkpoints, loadCheckpoints, switchCheckpoint } = useThreadStore();
  useEffect(() => { void loadCheckpoints(); }, [loadCheckpoints]);
  if (checkpoints.length === 0) return null;
  return <label className={styles.switcher}>Checkpoint<select defaultValue={checkpoints.at(-1)?.id} onChange={(event) => void switchCheckpoint(event.target.value)}><option value="">当前</option>{checkpoints.map((item) => <option key={item.id} value={item.id}>{item.branch_name ?? item.id.slice(0, 8)}</option>)}</select></label>;
}
