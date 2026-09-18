import { create } from 'zustand';

import {
  storedThemePreference,
  ThemePreference,
  type ThemePreference as ThemePreferenceType,
} from '@/app/domain/theme';

export type { ThemePreference } from '@/app/domain/theme';

interface UiState {
  themePreference: ThemePreferenceType;
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  authDialogOpen: boolean;
  threadSearchOpen: boolean;
  mcpSettingsOpen: boolean;
  profileDialogOpen: boolean;
  settingsDialogOpen: boolean;
  branchChatEnabled: boolean;
  setThemePreference: (preference: ThemePreference) => void;
  toggleSidebar: () => void;
  setMobileSidebarOpen: (open: boolean) => void;
  setAuthDialogOpen: (open: boolean) => void;
  setThreadSearchOpen: (open: boolean) => void;
  setMcpSettingsOpen: (open: boolean) => void;
  setProfileDialogOpen: (open: boolean) => void;
  setSettingsDialogOpen: (open: boolean) => void;
  setBranchChatEnabled: (enabled: boolean) => void;
}

const SIDEBAR_KEY = 'lui-agent:sidebar-collapsed';
const BRANCH_CHAT_KEY = 'lui-agent:branch-chat-enabled';

function initialBranchChat(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = window.localStorage.getItem(BRANCH_CHAT_KEY);
  return stored !== 'false';
}

function initialCollapsed() {
  return typeof window !== 'undefined' && window.localStorage.getItem(SIDEBAR_KEY) === 'true';
}

function initialThemePreference(): ThemePreferenceType {
  return typeof window === 'undefined'
    ? ThemePreference.System
    : storedThemePreference(window.localStorage.getItem('lui-agent:theme'));
}

export const useUiStore = create<UiState>((set) => ({
  themePreference: initialThemePreference(),
  sidebarCollapsed: initialCollapsed(),
  mobileSidebarOpen: false,
  authDialogOpen: false,
  threadSearchOpen: false,
  mcpSettingsOpen: false,
  profileDialogOpen: false,
  settingsDialogOpen: false,
  branchChatEnabled: initialBranchChat(),
  setThemePreference: (themePreference) => set({ themePreference }),
  toggleSidebar: () =>
    set((state) => {
      const sidebarCollapsed = !state.sidebarCollapsed;
      window.localStorage.setItem(SIDEBAR_KEY, String(sidebarCollapsed));
      return { sidebarCollapsed };
    }),
  setMobileSidebarOpen: (mobileSidebarOpen) => set({ mobileSidebarOpen }),
  setAuthDialogOpen: (authDialogOpen) => set({ authDialogOpen }),
  setThreadSearchOpen: (threadSearchOpen) => set({ threadSearchOpen }),
  setMcpSettingsOpen: (mcpSettingsOpen) => set({ mcpSettingsOpen }),
  setProfileDialogOpen: (profileDialogOpen) => set({ profileDialogOpen }),
  setSettingsDialogOpen: (settingsDialogOpen) => set({ settingsDialogOpen }),
  setBranchChatEnabled: (branchChatEnabled) => {
    window.localStorage.setItem(BRANCH_CHAT_KEY, String(branchChatEnabled));
    set({ branchChatEnabled });
  },
}));
