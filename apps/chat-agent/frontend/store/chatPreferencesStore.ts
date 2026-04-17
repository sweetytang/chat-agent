import { create } from "zustand";
import type { RunMetadata } from "@common/types/run";

interface ChatPreferencesState {
    deepThinkingEnabled: boolean;
    generativeUiEnabled: boolean;
    structuredOutputEnabled: boolean;
    toggleDeepThinking: () => void;
    toggleGenerativeUi: () => void;
    toggleStructuredOutput: () => void;
}

export const useChatPreferencesStore = create<ChatPreferencesState>((set) => ({
    deepThinkingEnabled: false,
    generativeUiEnabled: false,
    structuredOutputEnabled: false,
    toggleDeepThinking: () => {
        set((state) => ({ deepThinkingEnabled: !state.deepThinkingEnabled }));
    },
    toggleGenerativeUi: () => {
        set((state) => ({
            generativeUiEnabled: !state.generativeUiEnabled,
            structuredOutputEnabled: state.generativeUiEnabled ? state.structuredOutputEnabled : false,
        }));
    },
    toggleStructuredOutput: () => {
        set((state) => ({
            generativeUiEnabled: state.structuredOutputEnabled ? state.generativeUiEnabled : false,
            structuredOutputEnabled: !state.structuredOutputEnabled,
        }));
    },
}));

export function getRunMetadataSnapshot(
    state: Pick<ChatPreferencesState, "deepThinkingEnabled" | "generativeUiEnabled" | "structuredOutputEnabled">,
): RunMetadata {
    return {
        deepThinkingEnabled: state.deepThinkingEnabled,
        generativeUiEnabled: state.generativeUiEnabled,
        structuredOutputEnabled: state.structuredOutputEnabled,
    };
}
