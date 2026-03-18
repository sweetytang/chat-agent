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

    return (
        <div className={styles.searchCard}>
            <div className={styles.searchHeader}>
                <span className={styles.searchIcon}>🔍</span>
                <h3 className={styles.searchLabel}>Search Query</h3>
            </div>
            <div className={styles.searchQuery}>"{args.query}"</div>

            <div className={styles.searchResults}>
                {data.results?.map((r: any, i: number) => (
                    <div key={i} className={styles.searchResultItem}>
                        <div className={styles.searchResultTitle}>{r.title}</div>
                        <div className={styles.searchResultSnippet}>{r.snippet}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
