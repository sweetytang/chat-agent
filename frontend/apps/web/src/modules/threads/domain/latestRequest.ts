export interface LatestRequestTracker {
  start: (key: string) => number;
  isLatest: (key: string, requestId: number) => boolean;
  clear: (key: string) => void;
}

export function createLatestRequestTracker(): LatestRequestTracker {
  const latestRequestIds = new Map<string, number>();
  return {
    start: (key) => {
      const requestId = (latestRequestIds.get(key) ?? 0) + 1;
      latestRequestIds.set(key, requestId);
      return requestId;
    },
    isLatest: (key, requestId) => latestRequestIds.get(key) === requestId,
    clear: (key) => latestRequestIds.delete(key),
  };
}
