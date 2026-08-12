import type { ThreadSummary } from '@/modules/threads/types/thread';

export function filterThreads(threads: ThreadSummary[], query: string): ThreadSummary[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return threads;

  return threads.filter((thread) =>
    (thread.title ?? '未命名会话').toLocaleLowerCase().includes(normalized),
  );
}
