const activeControllers = new Map<string, AbortController>();

export function activateStream(threadId: string, controller: AbortController): void {
  activeControllers.get(threadId)?.abort();
  activeControllers.set(threadId, controller);
}

export function clearActiveStream(threadId: string, controller: AbortController): void {
  // 旧请求结束时不能清掉同一会话后来启动的新请求。
  if (activeControllers.get(threadId) === controller) activeControllers.delete(threadId);
}

export function abortActiveStream(threadId: string): void {
  activeControllers.get(threadId)?.abort();
  activeControllers.delete(threadId);
}

export function abortAllStreams(): void {
  activeControllers.forEach((controller) => controller.abort());
  activeControllers.clear();
}
