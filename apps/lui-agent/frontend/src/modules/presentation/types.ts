export type PresentationKind =
  'tool-result' | 'approval' | 'structured-output' | 'generative-ui' | 'error';

export interface PresentationItem {
  id: string;
  runId: string;
  sequence: number;
  kind: PresentationKind;
  data: Record<string, unknown>;
}
