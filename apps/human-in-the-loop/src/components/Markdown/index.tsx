/**
 * Markdown 渲染组件
 * 使用 react-markdown + remark-gfm 渲染 Markdown 内容
 */
import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./index.module.scss";

interface MarkdownProps {
    children: string;
    className?: string;
    streaming?: boolean;
}

function Markdown({ children, className, streaming = false }: MarkdownProps) {
    const combinedClassName = `${styles.markdownContent} ${streaming ? styles.markdownContentStreaming : ""} ${className || ""}`;

    if (streaming) {
        return (
            <div className={combinedClassName}>
                {children}
            </div>
        );
    }

    return (
        <div className={combinedClassName}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
        </div>
    );
}

export default memo(Markdown);
