import type { AgentEvent } from '@/modules/runs/types/events';

type Dispatch = (event: AgentEvent) => void;
type RequestFrame = (callback: () => void) => number;
type CancelFrame = (frameId: number) => void;

export interface FrameEventDispatcher {
  push: (event: AgentEvent) => void;
  flush: () => void;
  cancel: () => void;
}

export function createFrameEventDispatcher(
  dispatch: Dispatch,
  requestFrame: RequestFrame = (callback) => window.requestAnimationFrame(callback),
  cancelFrame: CancelFrame = (frameId) => window.cancelAnimationFrame(frameId),
): FrameEventDispatcher {
  let frameId: number | null = null;
  let pendingDelta: AgentEvent | null = null;

  function flush() {
    if (frameId !== null) {
      cancelFrame(frameId);
      frameId = null;
    }
    if (!pendingDelta) return;
    const event = pendingDelta;
    pendingDelta = null;
    dispatch(event);
  }

  function cancel() {
    if (frameId !== null) cancelFrame(frameId);
    frameId = null;
    pendingDelta = null;
  }

  function push(event: AgentEvent) {
    // 对于其他事件，立即刷新并分发  
    if (event.event !== 'message.delta') {
      flush();
      dispatch(event);
      return;
    }

    // 对于message.delta事件，合并同一帧内收到的多个事件，通过requestAnimationFrame进行节流，flush分发，减少渲染次数
    const previousContent = pendingDelta?.data.content;
    const content = event.data.content;
    pendingDelta = {
      ...event,
      data: {
        ...event.data,
        content:
          (typeof previousContent === 'string' ? previousContent : '') +
          (typeof content === 'string' ? content : ''),
      },
    };

    /** 等同于
     * if (frameId === null || frameId === undefined) {
          frameId = requestFrame(flush);
       }
     */
    frameId ??= requestFrame(flush);
  }

  return { push, flush, cancel };
}
