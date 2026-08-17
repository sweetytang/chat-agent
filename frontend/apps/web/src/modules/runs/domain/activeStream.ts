let activeController: AbortController | null = null;

export function activateStream(controller: AbortController): void {
  activeController?.abort();
  activeController = controller;
}

export function clearActiveStream(controller: AbortController): void {
  // 只有当正在结束的请求仍然是当前活动请求时，才清空全局控制器；旧请求不能影响后来启动的新请求。
  if (activeController === controller) activeController = null;
}

export function abortActiveStream(): void {
  activeController?.abort();
  activeController = null;
}
