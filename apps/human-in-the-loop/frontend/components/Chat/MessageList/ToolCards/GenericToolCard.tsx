/**
 * GenericToolCard — 通用工具调用结果展示卡片
 * 当没有匹配到特定工具卡片时使用此通用型展示。
 */
import React from "react";
import styles from "./index.module.scss";

export function GenericToolCard({ toolCall }: { toolCall: any }) {
    return (
        <div className={styles.genericCard}>
            <div className={styles.genericHeader}>
                <span className={styles.genericIcon}>⚙️</span>
                <h3 className={styles.genericName}>{toolCall.call.name}</h3>
            </div>
            <div className={styles.genericSection}>
                <div className={styles.genericSectionLabel}>Arguments</div>
                <pre className={styles.genericPre}>
                    {JSON.stringify(toolCall.call.args, null, 2)}
                </pre>
            </div>
            {toolCall.state === "completed" && toolCall.result && (
                <div className={styles.genericResultSection}>
                    <div className={styles.genericSectionLabel}>Result</div>
                    <pre className={styles.genericResultPre}>
                        {toolCall.result.content}
                    </pre>
                </div>
            )}
        </div>
    );
}
