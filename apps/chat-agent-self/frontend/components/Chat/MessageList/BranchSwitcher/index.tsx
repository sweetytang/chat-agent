import styles from './index.module.scss';

interface BranchSwitcherProps {
    branch: string | undefined;
    branchOptions: string[] | undefined;
    disabled?: boolean;
    onSwitch: (branchId: string) => void;
}

function getCurrentBranchIndex(
    branch: string | undefined,
    branchOptions: string[],
) {
    if (branch) {
        const exactIndex = branchOptions.indexOf(branch);
        if (exactIndex >= 0) {
            return exactIndex;
        }

        const prefixIndex = branchOptions.findIndex((option) => branch === option || branch.startsWith(`${option}>`));
        if (prefixIndex >= 0) {
            return prefixIndex;
        }
    }

    return null;
}

export default function BranchSwitcher({
    branch,
    branchOptions = [],
    disabled = false,
    onSwitch,
}: BranchSwitcherProps) {
    if (branchOptions.length <= 1) {
        return null;
    }

    const currentIndex = getCurrentBranchIndex(branch, branchOptions);
    const isResolved = currentIndex !== null;

    const hasPrev = isResolved && currentIndex > 0;
    const hasNext = isResolved && currentIndex < branchOptions.length - 1;

    return (
        <div className={styles.branchSwitcher}>
            <button
                className={styles.branchButton}
                type="button"
                aria-label="上一版本"
                disabled={disabled || !hasPrev}
                onClick={() => {
                    if (currentIndex === null) {
                        return;
                    }

                    onSwitch(branchOptions[currentIndex - 1]);
                }}
            >
                ◀
            </button>
            <span className={styles.branchLabel}>
                {isResolved ? `${currentIndex + 1}/${branchOptions.length}` : `?/${branchOptions.length}`}
            </span>
            <button
                className={styles.branchButton}
                type="button"
                aria-label="下一版本"
                disabled={disabled || !hasNext}
                onClick={() => {
                    if (currentIndex === null) {
                        return;
                    }

                    onSwitch(branchOptions[currentIndex + 1]);
                }}
            >
                ▶
            </button>
        </div>
    );
}
