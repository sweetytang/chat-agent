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
    if (event.event !== 'message.delta') {
      flush();
      dispatch(event);
      return;
    }

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
    frameId ??= requestFrame(flush);
  }

  return { push, flush, cancel };
}
