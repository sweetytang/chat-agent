import { defineCatalog } from "@json-render/core";
import { JSONUIProvider, Renderer, defineRegistry } from "@json-render/react";
import { schema } from "@json-render/react/schema";
import { z } from "zod";
import type { GenerativeUISpec } from "@common/types/generativeUi";
import Markdown from "@frontend/components/Markdown";
import { toRenderableGenerativeUiSpec } from "@frontend/services/chat/generativeUi";
import styles from "./index.module.scss";

const catalog = defineCatalog(schema, {
    components: {
        Hero: {
            description: "A hero block for the top-level summary with a title and short supporting text.",
            props: z.object({
                eyebrow: z.string().optional(),
                title: z.string(),
                body: z.string().optional(),
                align: z.enum(["left", "center"]).optional(),
            }),
        },
        Stack: {
            description: "A layout stack that groups child components vertically or horizontally.",
            props: z.object({
                direction: z.enum(["vertical", "horizontal"]).optional(),
                gap: z.enum(["sm", "md", "lg"]).optional(),
            }),
        },
        Panel: {
            description: "A card-like panel used to group related content.",
            props: z.object({
                title: z.string().optional(),
                description: z.string().optional(),
                tone: z.enum(["neutral", "info", "success", "warning"]).optional(),
                padding: z.enum(["sm", "md", "lg"]).optional(),
            }),
        },
        Metric: {
            description: "A compact metric card with a label, large value, and optional detail.",
            props: z.object({
                label: z.string(),
                value: z.string(),
                detail: z.string().optional(),
                emphasis: z.enum(["neutral", "accent", "success"]).optional(),
            }),
        },
        BulletList: {
            description: "A simple bullet list for takeaways, steps, or recommendations.",
            props: z.object({
                title: z.string().optional(),
                items: z.array(z.string()).min(1),
            }),
        },
        DataTable: {
            description: "A comparison or facts table with headers and rows.",
            props: z.object({
                title: z.string().optional(),
                columns: z.array(z.string()).min(1),
                rows: z.array(z.array(z.string()).min(1)).min(1),
            }),
        },
        CodeBlock: {
            description: "A code example block with optional language and filename metadata.",
            props: z.object({
                language: z.string().optional(),
                filename: z.string().optional(),
                code: z.string(),
            }),
        },
        Notice: {
            description: "A highlighted note for tips, cautions, or important reminders.",
            props: z.object({
                title: z.string(),
                body: z.string(),
                tone: z.enum(["info", "success", "warning"]).optional(),
            }),
        },
    },
    actions: {},
});

const { registry } = defineRegistry(catalog, {
    components: {
        Hero: ({ props }) => (
            <header
                className={styles.hero}
                data-align={props.align ?? "left"}
            >
                {props.eyebrow && <div className={styles.eyebrow}>{props.eyebrow}</div>}
                <h3 className={styles.heroTitle}>{props.title}</h3>
                {props.body && (
                    <Markdown className={styles.heroBody}>
                        {props.body}
                    </Markdown>
                )}
            </header>
        ),
        Stack: ({ props, children }) => (
            <div
                className={styles.stack}
                data-direction={props.direction ?? "vertical"}
                data-gap={props.gap ?? "md"}
            >
                {children}
            </div>
        ),
        Panel: ({ props, children }) => (
            <section
                className={styles.panel}
                data-padding={props.padding ?? "md"}
                data-tone={props.tone ?? "neutral"}
            >
                {(props.title || props.description) && (
                    <header className={styles.panelHeader}>
                        {props.title && <h4 className={styles.panelTitle}>{props.title}</h4>}
                        {props.description && (
                            <Markdown className={styles.panelDescription}>
                                {props.description}
                            </Markdown>
                        )}
                    </header>
                )}
                {children}
            </section>
        ),
        Metric: ({ props }) => (
            <article
                className={styles.metric}
                data-emphasis={props.emphasis ?? "neutral"}
            >
                <div className={styles.metricLabel}>{props.label}</div>
                <div className={styles.metricValue}>{props.value}</div>
                {props.detail && <div className={styles.metricDetail}>{props.detail}</div>}
            </article>
        ),
        BulletList: ({ props }) => {
            const items = Array.isArray(props.items) ? props.items : [];
            if (items.length === 0) {
                return null;
            }

            return (
                <section className={styles.listBlock}>
                    {props.title && <h4 className={styles.blockTitle}>{props.title}</h4>}
                    <ul className={styles.list}>
                        {items.map((item, index) => (
                            <li key={`${props.title ?? "list"}-${index}`}>{item}</li>
                        ))}
                    </ul>
                </section>
            );
        },
        DataTable: ({ props }) => {
            const columns = Array.isArray(props.columns) ? props.columns : [];
            const rows = Array.isArray(props.rows) ? props.rows.filter(Array.isArray) : [];

            if (columns.length === 0 || rows.length === 0) {
                return null;
            }

            return (
                <section className={styles.tableBlock}>
                    {props.title && <h4 className={styles.blockTitle}>{props.title}</h4>}
                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    {columns.map((column, index) => (
                                        <th key={`${column}-${index}`}>{column}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row, rowIndex) => (
                                    <tr key={`row-${rowIndex}`}>
                                        {row.map((cell, cellIndex) => (
                                            <td key={`row-${rowIndex}-cell-${cellIndex}`}>{cell}</td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            );
        },
        CodeBlock: ({ props }) => (
            <section className={styles.codeBlock}>
                <div className={styles.codeMeta}>
                    <span>{props.filename || "Code Example"}</span>
                    <span>{props.language || "text"}</span>
                </div>
                <pre className={styles.codeContent}>
                    <code>{props.code}</code>
                </pre>
            </section>
        ),
        Notice: ({ props }) => (
            <section
                className={styles.notice}
                data-tone={props.tone ?? "info"}
            >
                <div className={styles.noticeTitle}>{props.title}</div>
                <Markdown className={styles.noticeBody}>{props.body}</Markdown>
            </section>
        ),
    },
});

interface GenerativeUICardProps {
    data: Partial<GenerativeUISpec>;
    isStreaming?: boolean;
}

export default function GenerativeUICard({
    data,
    isStreaming = false,
}: GenerativeUICardProps) {
    const spec = toRenderableGenerativeUiSpec(data);

    if (!spec) {
        return (
            <section className={styles.card}>
                <div className={styles.pendingState}>
                    {isStreaming ? "生成式 UI 正在逐步搭建..." : "暂时没有可渲染的生成式 UI 内容"}
                </div>
            </section>
        );
    }

    return (
        <section className={styles.card}>
            <div className={styles.cardHeader}>
                <span className={styles.badge}>生成式 UI</span>
                <span className={styles.cardHint}>
                    {isStreaming ? "正在渐进渲染组件树" : "由模型生成的组件化结果"}
                </span>
            </div>
            <JSONUIProvider
                registry={registry}
                {...(spec.state ? { initialState: spec.state } : {})}
            >
                <Renderer
                    spec={spec}
                    registry={registry}
                    loading={isStreaming}
                />
            </JSONUIProvider>
        </section>
    );
}
