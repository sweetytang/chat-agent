import type { HistoryMessage } from "@/types/history";

export function getMessageBranchIndex(message: HistoryMessage): number {
  const total = message.branch_options.length;
  if (
    typeof message.branch_index === "number" &&
    Number.isInteger(message.branch_index) &&
    message.branch_index >= 0 &&
    message.branch_index < total
  ) {
    return message.branch_index;
  }

  const checkpointIndex = message.branch_options.findIndex(
    (option) => option.checkpoint_id === message.checkpoint_id,
  );
  return checkpointIndex >= 0 ? checkpointIndex : 0;
}

export function findPreviousUserContent(
  history: HistoryMessage[],
  messageId: string,
): string | null {
  const messageIndex = history.findIndex((message) => message.id === messageId);
  if (messageIndex < 0) return null;

  for (let index = messageIndex - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message?.role === "user") return message.content;
  }

  return null;
}

export function historyBeforeMessage(
  history: HistoryMessage[],
  messageId: string,
): HistoryMessage[] {
  const messageIndex = history.findIndex((message) => message.id === messageId);
  return messageIndex >= 0 ? history.slice(0, messageIndex) : history;
}
