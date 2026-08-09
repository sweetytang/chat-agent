import type { MessageBranchOption } from "@/modules/threads/types/history";
import styles from "./index.module.css";

interface BranchSwitcherProps {
  branchOptions: MessageBranchOption[];
  currentIndex: number;
  disabled?: boolean;
  onSwitch: (checkpointId: string) => void;
}

export function BranchSwitcher({
  branchOptions,
  currentIndex,
  disabled = false,
  onSwitch,
}: BranchSwitcherProps) {
  if (branchOptions.length <= 1) return null;

  const previous = branchOptions[currentIndex - 1];
  const next = branchOptions[currentIndex + 1];

  return <div className={styles.switcher} aria-label="消息版本">
    <button
      aria-label="上一版本"
      disabled={disabled || !previous}
      onClick={() => { if (previous) onSwitch(previous.checkpoint_id); }}
      title="上一版本"
      type="button"
    >←</button>
    <span>{currentIndex + 1}/{branchOptions.length}</span>
    <button
      aria-label="下一版本"
      disabled={disabled || !next}
      onClick={() => { if (next) onSwitch(next.checkpoint_id); }}
      title="下一版本"
      type="button"
    >→</button>
  </div>;
}
