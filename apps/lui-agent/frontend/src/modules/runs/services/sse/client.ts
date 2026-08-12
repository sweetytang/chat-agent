import { isAgentEvent, type AgentEvent } from '@/modules/runs/types/events';
import { fetchWithAuth } from '@/shared/http/client';

export interface SseRequest {
  url: string;
  body: unknown;
  signal?: AbortSignal;
}

function parseEvent(block: string): AgentEvent | null {
  const data = block
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');
  if (!data || data === '[DONE]') return null;

  try {
    const parsed: unknown = JSON.parse(data);
    return isAgentEvent(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function* streamAgentEvents({
  url,
  body,
  signal,
}: SseRequest): AsyncGenerator<AgentEvent> {
  const response = await fetchWithAuth(
    url,
    {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    },
    true,
  );
  if (!response.ok) throw new Error(`请求失败（${response.status}）`);
  if (!response.body) throw new Error('服务端未返回流式响应');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let lastSequence = -1;

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        const event = parseEvent(block);
        if (event && event.sequence > lastSequence) {
          lastSequence = event.sequence;
          yield event;
        }
      }
      if (done) break;
    }
    const finalEvent = parseEvent(buffer);
    if (finalEvent && finalEvent.sequence > lastSequence) yield finalEvent;
  } finally {
    reader.releaseLock();
  }
}
