import { create } from "zustand";

interface ChatPreferencesState {
    deepThinkingEnabled: boolean;
    setDeepThinkingEnabled: (enabled: boolean) => void;
    toggleDeepThinking: () => void;
}

export const useChatPreferencesStore = create<ChatPreferencesState>((set) => ({
    deepThinkingEnabled: false,
    setDeepThinkingEnabled: (enabled) => {
        set({ deepThinkingEnabled: enabled });
    },
    toggleDeepThinking: () => {
        set((state) => ({ deepThinkingEnabled: !state.deepThinkingEnabled }));
    },
}));
