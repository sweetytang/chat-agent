import { ReactNode, useEffect, useRef, useState } from "react";
import styles from "./index.module.scss";

type CollapsibleTone = "accent" | "light";
type CollapsibleFade = "default" | "human";

interface CollapsibleBoxProps {
    collapseKey: string;
    children: ReactNode;
    maxCollapsedHeight?: number;
    className?: string;
    contentClassName?: string;
    expandLabel?: string;
    collapseLabel?: string;
    freezeAutoCollapse?: boolean;
    tone?: CollapsibleTone;
    fade?: CollapsibleFade;
}

export default function CollapsibleBox({
    collapseKey,
    children,
    maxCollapsedHeight = 240,
    className = "",
    contentClassName = "",
    expandLabel = "展开全文",
    collapseLabel = "收起",
    freezeAutoCollapse = false,
    tone = "accent",
    fade = "default",
}: CollapsibleBoxProps) {
    const contentInnerRef = useRef<HTMLDivElement | null>(null);
    const [contentHeight, setContentHeight] = useState(0);
    const [isExpanded, setIsExpanded] = useState(true);
    const [hasManualToggle, setHasManualToggle] = useState(false);
    const [hasAutoCollapsedForKey, setHasAutoCollapsedForKey] = useState(false);

    const isCollapsible = contentHeight > maxCollapsedHeight + 4;

    useEffect(() => {
        setHasManualToggle(false);
        setIsExpanded(true);
        setHasAutoCollapsedForKey(false);
    }, [collapseKey]);

    useEffect(() => {
        const node = contentInnerRef.current;
        if (!node) return;

        const updateHeight = () => {
            setContentHeight(node.scrollHeight);
        };

        updateHeight();

        if (typeof ResizeObserver === "undefined") return;

        const observer = new ResizeObserver(() => {
            updateHeight();
        });
        observer.observe(node);

        return () => observer.disconnect();
    }, [collapseKey, children]);

    useEffect(() => {
        if (freezeAutoCollapse || hasManualToggle || hasAutoCollapsedForKey || contentHeight === 0) return;
        setIsExpanded(!isCollapsible);
        setHasAutoCollapsedForKey(true);
    }, [freezeAutoCollapse, hasManualToggle, hasAutoCollapsedForKey, isCollapsible, contentHeight]);

    return (
        <div className={`${styles.collapsibleBox} ${className}`}>
            <div
                className={`${styles.collapsibleContent} ${
                    !isExpanded && isCollapsible ? styles.collapsibleContentCollapsed : ""
                } ${contentClassName}`}
                style={!isExpanded && isCollapsible ? { maxHeight: `${maxCollapsedHeight}px` } : undefined}
            >
                <div ref={contentInnerRef}>
                    {children}
                </div>
                {!isExpanded && isCollapsible && (
                    <div
                        className={`${styles.collapsibleFade} ${
                            fade === "human" ? styles.collapsibleFadeHuman : styles.collapsibleFadeDefault
                        }`}
                    />
                )}
            </div>
            {isCollapsible && !freezeAutoCollapse && (
                <button
                    type="button"
                    className={`${styles.collapsibleToggleBtn} ${
                        tone === "light" ? styles.collapsibleToggleBtnLight : styles.collapsibleToggleBtnAccent
                    }`}
                    onClick={() => {
                        setHasManualToggle(true);
                        setIsExpanded((current) => !current);
                    }}
                >
                    {isExpanded ? collapseLabel : expandLabel}
                </button>
            )}
        </div>
    );
}
