import { useEffect, useId, useMemo, useState } from "react";
import styles from "./index.module.scss";

interface ReasoningBubbleProps {
    reasoning: string;
    isStreaming: boolean;
}

const PREVIEW_LENGTH = 140;

function createPreview(reasoning: string) {
    const normalizedReasoning = reasoning.replace(/\s+/g, " ").trim();
    if (normalizedReasoning.length <= PREVIEW_LENGTH) {
        return normalizedReasoning;
    }

    return `${normalizedReasoning.slice(0, PREVIEW_LENGTH).trimEnd()}...`;
}

export default function ReasoningBubble({ reasoning, isStreaming }: ReasoningBubbleProps) {
    const contentId = useId();
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
        if (isStreaming) {
            setIsExpanded(false);
        }
    }, [isStreaming, reasoning]);

    const preview = useMemo(() => createPreview(reasoning), [reasoning]);

    return (
        <section className={styles.reasoningBubble}>
            <button
                aria-controls={contentId}
                aria-expanded={isExpanded}
                className={styles.reasoningToggle}
                disabled={isStreaming}
                type="button"
                onClick={() => setIsExpanded((current) => !current)}
            >
                <span className={styles.reasoningTitle}>
                    <span
                        aria-hidden="true"
                        className={`${styles.reasoningStatus} ${isStreaming ? styles.reasoningStatusStreaming : ""}`}
                    />
                    {isStreaming ? "模型正在思考" : `思考摘要（${reasoning.length} 字符）`}
                </span>
                <span className={`${styles.reasoningChevron} ${isExpanded ? styles.reasoningChevronExpanded : ""}`}>
                    ▾
                </span>
            </button>
            {!isExpanded && preview && (
                <p className={styles.reasoningPreview}>
                    {preview}
                </p>
            )}
            {isExpanded && (
                <pre
                    className={styles.reasoningContent}
                    id={contentId}
                >
                    {reasoning}
                </pre>
            )}
        </section>
    );
}
