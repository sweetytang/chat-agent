import { create } from "zustand";

interface ChatPreferencesState {
    deepThinkingEnabled: boolean;
    structuredOutputEnabled: boolean;
    setDeepThinkingEnabled: (enabled: boolean) => void;
    setStructuredOutputEnabled: (enabled: boolean) => void;
    toggleDeepThinking: () => void;
    toggleStructuredOutput: () => void;
}

export const useChatPreferencesStore = create<ChatPreferencesState>((set) => ({
    deepThinkingEnabled: false,
    structuredOutputEnabled: false,
    setDeepThinkingEnabled: (enabled) => {
        set({ deepThinkingEnabled: enabled });
    },
    setStructuredOutputEnabled: (enabled) => {
        set({ structuredOutputEnabled: enabled });
    },
    toggleDeepThinking: () => {
        set((state) => ({ deepThinkingEnabled: !state.deepThinkingEnabled }));
    },
    toggleStructuredOutput: () => {
        set((state) => ({ structuredOutputEnabled: !state.structuredOutputEnabled }));
    },
}));
