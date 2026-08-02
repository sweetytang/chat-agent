import { isAgentEvent, type AgentEvent } from "@/types/events";

export interface SseRequest {
  url: string;
  body: unknown;
  token?: string;
  signal?: AbortSignal;
}

function parseEvent(block: string): AgentEvent | null {
  const data = block
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (!data || data === "[DONE]") return null;

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
  token,
  signal,
}: SseRequest): AsyncGenerator<AgentEvent> {
  token ??= localStorage.getItem("lui-agent.access-token") ?? undefined;
  const headers: Record<string, string> = {
    Accept: "text/event-stream",
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw new Error(`请求失败（${response.status}）`);
  if (!response.body) throw new Error("服务端未返回流式响应");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastSequence = -1;

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? "";
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
