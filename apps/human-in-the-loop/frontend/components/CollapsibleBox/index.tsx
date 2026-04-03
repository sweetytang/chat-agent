import { ReactNode, useLayoutEffect, useRef, useState, useId } from "react";
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
    const contentId = useId();
    const contentInnerRef = useRef<HTMLDivElement | null>(null);
    const [contentHeight, setContentHeight] = useState(0);
    const [isExpanded, setIsExpanded] = useState(true);
    const [hasManualToggle, setHasManualToggle] = useState(false);

    const isCollapsible = contentHeight > maxCollapsedHeight + 4;

    useLayoutEffect(() => {
        setHasManualToggle(false);
        setIsExpanded(true);
    }, [collapseKey]);

    useLayoutEffect(() => {
        if (freezeAutoCollapse) {
            setContentHeight((currentHeight) => (currentHeight === 0 ? currentHeight : 0));
            return;
        }

        const node = contentInnerRef.current;
        if (!node) return;

        const updateHeight = () => {
            const nextHeight = node.scrollHeight;
            setContentHeight((currentHeight) => (
                currentHeight === nextHeight ? currentHeight : nextHeight
            ));
        };

        updateHeight();

        if (typeof ResizeObserver === "undefined") return;

        let frameId: number | null = null;
        const scheduleHeightUpdate = () => {
            if (frameId !== null) {
                cancelAnimationFrame(frameId);
            }
            frameId = requestAnimationFrame(() => {
                frameId = null;
                updateHeight();
            });
        };

        const observer = new ResizeObserver(() => {
            scheduleHeightUpdate();
        });
        observer.observe(node);

        return () => {
            observer.disconnect();
            if (frameId !== null) {
                cancelAnimationFrame(frameId);
            }
        };
    }, [collapseKey, freezeAutoCollapse]);

    return (
        <div className={`${styles.collapsibleBox} ${className}`}>
            <div
                id={contentId}
                className={`${styles.collapsibleContent} ${!isExpanded && isCollapsible ? styles.collapsibleContentCollapsed : ""
                    } ${contentClassName}`}
                style={!isExpanded && isCollapsible ? { maxHeight: `${maxCollapsedHeight}px` } : undefined}
            >
                <div ref={contentInnerRef}>
                    {children}
                </div>
                {!isExpanded && isCollapsible && (
                    <div
                        className={`${styles.collapsibleFade} ${fade === "human" ? styles.collapsibleFadeHuman : styles.collapsibleFadeDefault
                            }`}
                    />
                )}
            </div>
            {isCollapsible && !freezeAutoCollapse && (
                <button
                    type="button"
                    aria-controls={contentId}
                    aria-expanded={isExpanded}
                    className={`${styles.collapsibleToggleBtn} ${tone === "light" ? styles.collapsibleToggleBtnLight : styles.collapsibleToggleBtnAccent
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
