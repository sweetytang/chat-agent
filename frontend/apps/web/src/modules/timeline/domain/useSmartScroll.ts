import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

const BOTTOM_THRESHOLD = 72;

export function useSmartScroll(
  scrollRef: RefObject<HTMLElement | null>,
  changeSignal: object,
  resetKey: string,
) {
  const followingRef = useRef(true);
  const [hasNewContent, setHasNewContent] = useState(false);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const onScroll = () => {
      const atBottom =
        element.scrollHeight - element.scrollTop - element.clientHeight <= BOTTOM_THRESHOLD;
      followingRef.current = atBottom;
      if (atBottom) setHasNewContent(false);
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    return () => element.removeEventListener('scroll', onScroll);
  }, [scrollRef]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const frame = requestAnimationFrame(() => {
      if (followingRef.current) {
        element.scrollTo({
          top: element.scrollHeight,
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
        });
        setHasNewContent(false);
      } else {
        setHasNewContent(true);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [changeSignal, scrollRef]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    followingRef.current = true;
    const frame = requestAnimationFrame(() => {
      setHasNewContent(false);
      element.scrollTo({ top: element.scrollHeight, behavior: 'auto' });
    });
    return () => cancelAnimationFrame(frame);
  }, [resetKey, scrollRef]);

  function scrollToBottom() {
    const element = scrollRef.current;
    if (!element) return;
    followingRef.current = true;
    setHasNewContent(false);
    element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
  }

  return { hasNewContent, scrollToBottom };
}
