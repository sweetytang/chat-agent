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
    const bottomRef = useRef<HTMLDivElement>(null);
    const scrollTimerRef = useRef<NodeJS.Timeout | null>(null);

    // 智能恢复逻辑：如果用户停止操作且在底部，恢复自动滚动
    const handleInactivityAndResume = useCallback((isAtBottom: boolean) => {
        if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);

        if (isAtBottom) {
            scrollTimerRef.current = setTimeout(() => {
                setAutoScroll(true);
            }, resumeDelay);
        }
    }, [setAutoScroll, resumeDelay]);

    // 滚动事件处理
    const onScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
        const target = e.currentTarget;
        const atBottom = target.scrollTop >= target.scrollHeight - target.clientHeight - threshold;

        // 用户主动滚动时禁用自动状态
        setAutoScroll(false);
        handleInactivityAndResume(atBottom);
    }, [setAutoScroll, handleInactivityAndResume, threshold]);

    // 手势拦截：开始触摸或滚轮时立即禁用
    const onTouchOrWheel = useCallback(() => {
        setAutoScroll(false);
    }, [setAutoScroll]);

    // 手动强制滚动到最新（用于发送消息时）
    const forceScroll = useCallback(() => {
        setAutoScroll(true);
    }, [setAutoScroll]);

    // 执行滚动副作用
    useEffect(() => {
        if (autoScroll) {
            // 使用 behavior: 'auto' 保证聊天体验的即时性
            bottomRef.current?.scrollIntoView({ behavior: 'auto' });
        }
    }, [autoScroll, ...dependencies]);

    return {
        bottomRef,
        onScroll,
        onTouchOrWheel,
        forceScroll,
        autoScroll
    };
}
