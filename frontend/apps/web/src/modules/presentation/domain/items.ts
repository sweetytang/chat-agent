import type { PresentationItem, PresentationKind } from '@/modules/presentation/types';

export function appendPresentationItem(
  items: PresentationItem[],
  runId: string,
  sequence: number,
  kind: PresentationKind,
  data: Record<string, unknown>,
): PresentationItem[] {
  if (items.some((item) => item.runId === runId && item.sequence === sequence)) return items;
  return [...items, { id: `${runId}:${sequence}:${kind}`, runId, sequence, kind, data }].sort(
    (left, right) => left.sequence - right.sequence,
  );
}
