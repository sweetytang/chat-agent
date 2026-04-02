/**
 * ErrorCard — 工具执行出错的状态卡片
 */
import React from "react";
import styles from "./index.module.scss";

export function ErrorCard({ name, error }: { name: string; error?: any }) {
    return (
        <div className={styles.errorCard}>
            <h3 className={styles.errorTitle}>Error in {name}</h3>
            <p className={styles.errorMessage}>
                {error?.content ?? "Tool execution failed"}
            </p>
        </div>
    );
}
