/**
 * SearchCard — 网页搜索结果展示卡片
 */
import React from "react";
import styles from "./index.module.scss";
import { LoadingCard } from "./LoadingCard";
import { ErrorCard } from "./ErrorCard";

export function SearchCard({ args, result }: { args: { query: string }; result?: any }) {
    if (!result || !result.content) return <LoadingCard name="web_search" />;

    let data;
    try {
        data = JSON.parse(result.content as string);
    } catch {
        return <ErrorCard name="web_search" error={{ content: "Failed to parse result" }} />;
    }

    if (data?.error) {
        return <ErrorCard name="web_search" error={{ content: data.error }} />;
    }

    const results = Array.isArray(data.results) ? data.results : [];

    return (
        <div className={styles.searchCard}>
            <div className={styles.searchHeader}>
                <span className={styles.searchIcon}>🔍</span>
                <h3 className={styles.searchLabel}>Search Query</h3>
            </div>
            <div className={styles.searchQuery}>"{args.query}"</div>

            {data.answer && (
                <div className={styles.searchAnswer}>
                    <div className={styles.searchAnswerLabel}>Quick Answer</div>
                    <div className={styles.searchAnswerText}>{data.answer}</div>
                </div>
            )}

            <div className={styles.searchResults}>
                {results.map((r: any, i: number) => (
                    <div key={i} className={styles.searchResultItem}>
                        {r.url ? (
                            <a
                                className={styles.searchResultTitle}
                                href={r.url}
                                target="_blank"
                                rel="noreferrer"
                            >
                                {r.title}
                            </a>
                        ) : (
                            <div className={styles.searchResultTitle}>{r.title}</div>
                        )}
                        {r.url && <div className={styles.searchResultUrl}>{r.url}</div>}
                        <div className={styles.searchResultSnippet}>{r.content ?? r.snippet}</div>
                    </div>
                ))}
                {results.length === 0 && (
                    <div className={styles.searchEmpty}>No search results returned.</div>
                )}
            </div>
        </div>
    );
}
