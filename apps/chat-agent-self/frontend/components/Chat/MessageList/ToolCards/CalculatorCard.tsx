/**
 * CalculatorCard — 数学计算结果展示卡片
 */
import React from "react";
import styles from "./index.module.scss";
import { LoadingCard } from "./LoadingCard";
import { ErrorCard } from "./ErrorCard";

export function CalculatorCard({ args, result }: { args: { expression: string }; result?: any }) {
    if (!result || !result.content) return <LoadingCard name="calculator" />;

    let data;
    try {
        data = JSON.parse(result.content as string);
    } catch {
        return <ErrorCard name="calculator" error={{ content: "Failed to parse result" }} />;
    }

    if (data.error) {
        return <ErrorCard name="calculator" error={{ content: data.error }} />;
    }

    return (
        <div className={styles.calculatorCard}>
            <div className={styles.calculatorHeader}>
                <span className={styles.calculatorIcon}>🧮</span>
                <h3 className={styles.calculatorLabel}>Calculation</h3>
            </div>
            <div className={styles.calculatorBody}>
                <div className={styles.calculatorFieldLabel}>Expression</div>
                <code className={styles.calculatorExpression}>{args.expression}</code>
                <div className={styles.calculatorResultLabel}>Result</div>
                <div className={styles.calculatorResult}>{data.result}</div>
            </div>
        </div>
    );
}
