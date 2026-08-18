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
  let pendingDeltas: AgentEvent[] = [];

  function isDelta(event: AgentEvent): boolean {
    return (
      event.event === 'message.delta' ||
      event.event === 'reasoning.delta' ||
      event.event === 'structured_output.delta' ||
      event.event === 'generative_ui.delta'
    );
  }

  function itemId(event: AgentEvent): unknown {
    return event.data.item_id;
  }

  function flush() {
    if (frameId !== null) {
      cancelFrame(frameId);
      frameId = null;
    }
    const events = pendingDeltas;
    pendingDeltas = [];
    events.forEach(dispatch);
  }

  function cancel() {
    if (frameId !== null) cancelFrame(frameId);
    frameId = null;
    pendingDeltas = [];
  }

  function push(event: AgentEvent) {
    // 对于其他事件，立即刷新并分发
    if (!isDelta(event)) {
      flush();
      dispatch(event);
      return;
    }

    // 对于message.delta事件，合并同一帧内收到的多个事件，通过requestAnimationFrame进行节流，flush分发，减少渲染次数
    const previous = pendingDeltas.at(-1);
    const canMerge =
      previous?.event === event.event &&
      itemId(previous) === itemId(event) &&
      (event.event === 'message.delta' || event.event === 'reasoning.delta');
    const previousContent = canMerge ? previous.data.content : '';
    const content = event.data.content;
    const pending = {
      ...event,
      data: {
        ...event.data,
        content:
          (typeof previousContent === 'string' ? previousContent : '') +
          (typeof content === 'string' ? content : ''),
      },
    };
    if (canMerge) pendingDeltas[pendingDeltas.length - 1] = pending;
    else pendingDeltas.push(pending);

    /** 等同于
     * if (frameId === null || frameId === undefined) {
          frameId = requestFrame(flush);
       }
     */
    frameId ??= requestFrame(flush);
  }

  return { push, flush, cancel };
}
