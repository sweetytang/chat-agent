import { useRef, useCallback, useEffect } from 'react';
import { useScrollStore } from '../store';

/**
 * 通用的自动滚动 Hook
 * @param dependencies 触发自动滚动的依赖项（通常是消息列表）
 * @param threshold 探测底部的阈值（默认 20px）
 * @param resumeDelay 恢复自动滚动的延迟时间（默认 1000ms）
 */
export function useAutoScroll(
    dependencies: any[],
    threshold = 30,
    resumeDelay = 500
) {
    const autoScroll = useScrollStore((s) => s.autoScroll);
    const setAutoScroll = useScrollStore((s) => s.setAutoScroll);
    const containerRef = useRef<HTMLElement | null>(null);
    const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const scrollFrameRef = useRef<number | null>(null);
    const interactionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const programmaticScrollRef = useRef(false);
    const interactionLockRef = useRef(false);

    const setAutoScrollIfNeeded = useCallback((enabled: boolean) => {
        if (useScrollStore.getState().autoScroll !== enabled) {
            setAutoScroll(enabled);
        }
    }, [setAutoScroll]);

    const clearResumeTimer = useCallback(() => {
        if (scrollTimerRef.current) {
            clearTimeout(scrollTimerRef.current);
            scrollTimerRef.current = null;
        }
    }, []);

    const releaseInteractionLock = useCallback(() => {
        if (interactionTimerRef.current) {
            clearTimeout(interactionTimerRef.current);
            interactionTimerRef.current = null;
        }
        interactionLockRef.current = false;
    }, []);

    const markProgrammaticScrollFinished = useCallback(() => {
        window.setTimeout(() => {
            programmaticScrollRef.current = false;
        }, 0);
    }, []);

    const suspendAutoScrollTemporarily = useCallback((duration = 320) => {
        releaseInteractionLock();
        interactionLockRef.current = true;
        interactionTimerRef.current = setTimeout(() => {
            interactionLockRef.current = false;
            interactionTimerRef.current = null;

            if (!useScrollStore.getState().autoScroll) return;

            const container = containerRef.current;
            if (!container) return;

            programmaticScrollRef.current = true;
            container.scrollTop = container.scrollHeight;
            markProgrammaticScrollFinished();
        }, duration);
    }, [markProgrammaticScrollFinished, releaseInteractionLock]);

    // 智能恢复逻辑：如果用户停止操作且在底部，恢复自动滚动
    const handleInactivityAndResume = useCallback((isAtBottom: boolean) => {
        clearResumeTimer();

        if (isAtBottom) {
            scrollTimerRef.current = setTimeout(() => {
                setAutoScrollIfNeeded(true);
            }, resumeDelay);
        }
    }, [clearResumeTimer, setAutoScrollIfNeeded, resumeDelay]);

    // 滚动事件处理
    const onScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
        if (programmaticScrollRef.current) return;

        const target = e.currentTarget;
        const atBottom = target.scrollTop >= target.scrollHeight - target.clientHeight - threshold;

        // 仅在真正离开底部时才关闭自动滚动，避免程序滚动和轻微抖动造成状态抖动
        if (!atBottom) {
            setAutoScrollIfNeeded(false);
        }
        handleInactivityAndResume(atBottom);
    }, [setAutoScrollIfNeeded, handleInactivityAndResume, threshold]);

    // 手势拦截：开始触摸或滚轮时立即禁用
    const onTouchOrWheel = useCallback(() => {
        if (programmaticScrollRef.current) return;
        clearResumeTimer();
        setAutoScrollIfNeeded(false);
    }, [clearResumeTimer, setAutoScrollIfNeeded]);

    // 手动强制滚动到最新（用于发送消息时）
    const forceScroll = useCallback(() => {
        clearResumeTimer();
        releaseInteractionLock();
        setAutoScrollIfNeeded(true);
    }, [clearResumeTimer, releaseInteractionLock, setAutoScrollIfNeeded]);

    const onPointerDownCapture = useCallback((e: React.PointerEvent<HTMLElement>) => {
        const target = e.target;
        if (!(target instanceof HTMLElement)) return;

        if (target.closest('button, a, input, textarea, select, summary, [role="button"]')) {
            suspendAutoScrollTemporarily();
        }
    }, [suspendAutoScrollTemporarily]);

    // 执行滚动副作用
    useEffect(() => {
        if (!autoScroll) return;
        if (interactionLockRef.current) return;

        if (scrollFrameRef.current !== null) {
            cancelAnimationFrame(scrollFrameRef.current);
        }

        scrollFrameRef.current = requestAnimationFrame(() => {
            scrollFrameRef.current = null;
            const container = containerRef.current;
            if (!container) return;

            programmaticScrollRef.current = true;
            container.scrollTop = container.scrollHeight;
            markProgrammaticScrollFinished();
        });
    }, [autoScroll, markProgrammaticScrollFinished, ...dependencies]);

    useEffect(() => () => {
        clearResumeTimer();
        releaseInteractionLock();
        if (scrollFrameRef.current !== null) {
            cancelAnimationFrame(scrollFrameRef.current);
        }
    }, [clearResumeTimer, releaseInteractionLock]);

    return {
        containerRef,
        onScroll,
        onTouchOrWheel,
        onPointerDownCapture,
        forceScroll,
        autoScroll
    };
}
