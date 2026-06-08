import Markdown from "@frontend/components/Markdown";
import type { StructuredOutputPayload } from "@common/types/structuredOutput";
import styles from "./index.module.scss";

const FORMAT_LABEL_MAP = {
    guide: "指南",
    comparison: "对比",
    explanation: "讲解",
} as const;

interface StructuredOutputCardProps {
    data: Partial<StructuredOutputPayload>;
    isStreaming?: boolean;
}

function getFormatLabel(format: StructuredOutputPayload["format"] | undefined) {
    if (!format) {
        return "结构化输出";
    }

    return FORMAT_LABEL_MAP[format] ?? "结构化输出";
}

export default function StructuredOutputCard({
    data,
    isStreaming = false,
}: StructuredOutputCardProps) {
    const highlights = Array.isArray(data.highlights)
        ? data.highlights.filter((highlight) => highlight && typeof highlight.label === "string")
        : [];
    const sections = Array.isArray(data.sections)
        ? data.sections.filter((section) => section && typeof section.title === "string")
        : [];
    const comparisonColumns = Array.isArray(data.comparisonTable?.columns) ? data.comparisonTable.columns : [];
    const comparisonRows = Array.isArray(data.comparisonTable?.rows)
        ? data.comparisonTable.rows.filter((row) => row && Array.isArray(row.values))
        : [];
    const nextSteps = Array.isArray(data.nextSteps) ? data.nextSteps : [];

    return (
        <section className={styles.structuredCard}>
            <header className={styles.header}>
                <div className={styles.headerMain}>
                    <span className={styles.formatBadge}>{getFormatLabel(data.format)}</span>
                    <h3 className={styles.title}>
                        {data.title || (isStreaming ? "正在组织结构化内容..." : "结构化结果")}
                    </h3>
                    {data.summary && (
                        <Markdown
                            className={styles.summary}
                            streaming={isStreaming}
                        >
                            {data.summary}
                        </Markdown>
                    )}
                </div>
                {highlights.length > 0 && (
                    <div className={styles.highlightGrid}>
                        {highlights.map((highlight, index) => (
                            <div
                                key={`${highlight.label}-${index}`}
                                className={styles.highlightCard}
                            >
                                <div className={styles.highlightLabel}>{highlight.label}</div>
                                <div className={styles.highlightValue}>{highlight.value}</div>
                            </div>
                        ))}
                    </div>
                )}
            </header>

            {comparisonColumns.length > 0 && comparisonRows.length > 0 && (
                <div className={styles.tableWrapper}>
                    <table className={styles.comparisonTable}>
                        <thead>
                            <tr>
                                {comparisonColumns.map((column, index) => (
                                    <th key={`${column}-${index}`}>{column}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {comparisonRows.map((row, rowIndex) => (
                                <tr key={`${row.label}-${rowIndex}`}>
                                    <td>{row.label}</td>
                                    {(Array.isArray(row.values) ? row.values : []).map((value, valueIndex) => (
                                        <td key={`${row.label}-${valueIndex}`}>{value}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {sections.length > 0 ? (
                <div className={styles.sectionList}>
                    {sections.map((section, index) => (
                        <article key={`${section.title}-${index}`} className={styles.sectionCard}>
                            <div className={styles.sectionIndex}>0{index + 1}</div>
                            <div className={styles.sectionBody}>
                                <h4 className={styles.sectionTitle}>{section.title}</h4>
                                {section.body && (
                                    <Markdown
                                        className={styles.sectionMarkdown}
                                        streaming={isStreaming}
                                    >
                                        {section.body}
                                    </Markdown>
                                )}
                                {Array.isArray(section.bullets) && section.bullets.length > 0 && (
                                    <ul className={styles.bulletList}>
                                        {section.bullets.map((bullet, bulletIndex) => (
                                            <li key={`${section.title}-bullet-${bulletIndex}`}>{bullet}</li>
                                        ))}
                                    </ul>
                                )}
                                {section.codeExample?.code && (
                                    <div className={styles.codeBlock}>
                                        <div className={styles.codeMeta}>
                                            <span>{section.codeExample.filename || "Code Example"}</span>
                                            <span>{section.codeExample.language || "text"}</span>
                                        </div>
                                        <pre className={styles.codeContent}>
                                            <code>{section.codeExample.code}</code>
                                        </pre>
                                    </div>
                                )}
                            </div>
                        </article>
                    ))}
                </div>
            ) : isStreaming ? (
                <div className={styles.pendingState}>等待分段内容流入...</div>
            ) : null}

            {nextSteps.length > 0 && (
                <div className={styles.nextSteps}>
                    <div className={styles.nextStepsTitle}>下一步建议</div>
                    <ol className={styles.nextStepsList}>
                        {nextSteps.map((step, index) => (
                            <li key={`${step}-${index}`}>{step}</li>
                        ))}
                    </ol>
                </div>
            )}
        </section>
    );
}
