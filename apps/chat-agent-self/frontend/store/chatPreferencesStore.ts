import { create } from "zustand";

interface ChatPreferencesState {
    deepThinkingEnabled: boolean;
    generativeUiEnabled: boolean;
    structuredOutputEnabled: boolean;
    setDeepThinkingEnabled: (enabled: boolean) => void;
    setGenerativeUiEnabled: (enabled: boolean) => void;
    setStructuredOutputEnabled: (enabled: boolean) => void;
    toggleDeepThinking: () => void;
    toggleGenerativeUi: () => void;
    toggleStructuredOutput: () => void;
}

export const useChatPreferencesStore = create<ChatPreferencesState>((set) => ({
    deepThinkingEnabled: false,
    generativeUiEnabled: false,
    structuredOutputEnabled: false,
    setDeepThinkingEnabled: (enabled) => {
        set({ deepThinkingEnabled: enabled });
    },
    setGenerativeUiEnabled: (enabled) => {
        set((state) => ({
            generativeUiEnabled: enabled,
            structuredOutputEnabled: enabled ? false : state.structuredOutputEnabled,
        }));
    },
    setStructuredOutputEnabled: (enabled) => {
        set((state) => ({
            generativeUiEnabled: enabled ? false : state.generativeUiEnabled,
            structuredOutputEnabled: enabled,
        }));
    },
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
