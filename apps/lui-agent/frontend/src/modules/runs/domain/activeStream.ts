let activeController: AbortController | null = null;

export function activateStream(controller: AbortController): void {
  activeController?.abort();
  activeController = controller;
}

export function clearActiveStream(controller: AbortController): void {
  if (activeController === controller) activeController = null;
}

export function abortActiveStream(): void {
  activeController?.abort();
  activeController = null;
}
