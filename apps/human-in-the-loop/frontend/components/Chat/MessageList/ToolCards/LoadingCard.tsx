/**
 * LoadingCard — 工具执行中的加载状态卡片
 */
import React from "react";
import styles from "./index.module.scss";

export function LoadingCard({ name }: { name: string }) {
    return (
        <div className={styles.loadingCard}>
            <span className={styles.loadingSpinner} />
            <span className={styles.loadingText}>Executing {name}...</span>
        </div>
    );
}
