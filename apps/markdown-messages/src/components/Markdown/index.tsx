import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ─── Markdown component ────────────────────────────────────────────────────────
export default function Markdown({ children, className }: { children: string; className?: string }) {
    return (
        <div className={className}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
        </div>
    );
}
