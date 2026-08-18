import { activateStream, clearActiveStream } from '@/modules/runs/domain/activeStream';
import { createFrameEventDispatcher } from '@/modules/runs/domain/frameEventDispatcher';
import { streamAgentEvents } from '@/modules/runs/services/sse/client';
import type { AgentEvent } from '@/modules/runs/types/events';

interface RunStreamOptions {
  threadId: string;
  url: string;
  body: unknown;
  onEvent: (event: AgentEvent) => void;
}

export async function consumeRunStream({
  threadId,
  url,
  body,
  onEvent,
}: RunStreamOptions): Promise<void> {
  const controller = new AbortController();
  const dispatcher = createFrameEventDispatcher(onEvent);
  activateStream(threadId, controller);
  try {
    for await (const event of streamAgentEvents({ url, body, signal: controller.signal }))
      dispatcher.push(event);
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) throw error;
  } finally {
    if (controller.signal.aborted) dispatcher.cancel();
    else dispatcher.flush();
    clearActiveStream(threadId, controller);
  }
}
