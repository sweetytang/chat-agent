import { BranchSwitcher } from '@/modules/checkpoints/components/BranchSwitcher';
import type { TimelineItem } from '@/modules/timeline/types';

import styles from './index.module.css';

export function TimelineBranchControls({
  disabled,
  item,
  onSwitch,
}: {
  disabled: boolean;
  item: TimelineItem;
  onSwitch: (checkpointId: string) => void;
}) {
  const branchOptions = item.branch_options ?? [];
  if (branchOptions.length <= 1) return null;

  const currentIndex =
    typeof item.branch_index === 'number'
      ? item.branch_index
      : Math.max(
          0,
          branchOptions.findIndex((option) => option.checkpoint_id === item.checkpoint_id),
        );

  return (
    <div className={styles.controls}>
      <BranchSwitcher
        branchOptions={branchOptions}
        currentIndex={currentIndex}
        disabled={disabled}
        onSwitch={onSwitch}
      />
    </div>
  );
}
