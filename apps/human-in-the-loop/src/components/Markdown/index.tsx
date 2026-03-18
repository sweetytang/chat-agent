/**
 * Markdown 渲染组件
 * 使用 react-markdown + remark-gfm 渲染 Markdown 内容
 */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./index.module.scss";

export default function Markdown({ children, className }: { children: string; className?: string }) {
    return (
        <div className={`${styles.markdownContent} ${className || ""}`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
        </div>
    );
}
