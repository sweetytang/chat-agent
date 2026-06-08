import { create } from 'zustand';

interface ScrollState {
    /** 是否开启自动滚动 */
    autoScroll: boolean;
    setAutoScroll: (enabled: boolean) => void;
}

export const useScrollStore = create<ScrollState>((set) => ({
    autoScroll: true,
    setAutoScroll: (enabled) => set({ autoScroll: enabled }),
}));

