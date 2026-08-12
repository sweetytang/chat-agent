export interface ComposerKeyEvent {
  key: string;
  shiftKey: boolean;
  isComposing: boolean;
}

export function shouldSubmitComposer(event: ComposerKeyEvent): boolean {
  return event.key === 'Enter' && !event.shiftKey && !event.isComposing;
}
