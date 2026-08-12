export async function stopRun(
  abort: () => void,
  runId: string | null,
  cancel: (runId: string) => Promise<unknown>,
): Promise<void> {
  abort();
  if (runId) await cancel(runId);
}
