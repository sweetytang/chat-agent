import type { MessageItem, TimelineItem, TimelineSnapshot } from '@/modules/timeline/types';

export function messageItems(snapshot: TimelineSnapshot): MessageItem[] {
  return snapshot.items.filter((item): item is MessageItem => item.kind === 'message');
}

export function findPreviousUserContent(items: TimelineItem[], itemId: string): string | null {
  const index = items.findIndex((item) => item.id === itemId);
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const item = items[cursor];
    if (item?.kind === 'message' && item.role === 'user') return item.content;
  }
  return null;
}

export function timelineBeforeItem(snapshot: TimelineSnapshot, itemId: string): TimelineSnapshot {
  const index = snapshot.items.findIndex((item) => item.id === itemId);
  return index < 0 ? snapshot : { version: 1, items: snapshot.items.slice(0, index) };
}

export function timelineBeforeAssistantAttempt(
  snapshot: TimelineSnapshot,
  itemId: string,
): TimelineSnapshot {
  const itemIndex = snapshot.items.findIndex((item) => item.id === itemId);
  if (itemIndex < 0) return snapshot;

  for (let index = itemIndex - 1; index >= 0; index -= 1) {
    const item = snapshot.items[index];
    if (item?.kind === 'message' && item.role === 'user') {
      return { version: 1, items: snapshot.items.slice(0, index + 1) };
    }
  }
  return { version: 1, items: [] };
}
