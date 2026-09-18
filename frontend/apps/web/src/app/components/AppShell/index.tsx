import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

import { AppTopBar } from '@/app/components/AppTopBar';
import { useUiStore } from '@/app/store/ui';
import { AuthDialog } from '@/modules/auth/components/AuthDialog';
import { ProfileDialog } from '@/modules/auth/components/ProfileDialog';
import { SettingsDialog } from '@/modules/auth/components/SettingsDialog';
import { McpSettings } from '@/modules/mcp/components/McpSettings';
import { Sidebar } from '@/modules/threads/components/Sidebar';
import { ThreadSearchDialog } from '@/modules/threads/components/ThreadSearchDialog';

import styles from './index.module.css';

export function AppShell({ children }: { children: ReactNode }) {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const mobileOpen = useUiStore((state) => state.mobileSidebarOpen);
  const setMobileOpen = useUiStore((state) => state.setMobileSidebarOpen);
  return (
    <div className={`${styles.shell} ${collapsed ? styles.collapsed : ''}`}>
      <div className={styles.desktopSidebar}>
        <Sidebar collapsed={collapsed} />
      </div>
      <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.overlay} />
          <Dialog.Content className={styles.drawer} aria-describedby={undefined}>
            <Dialog.Title className={styles.hiddenTitle}>会话导航</Dialog.Title>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <div className={styles.content}>
        <AppTopBar />
        {children}
      </div>
      <AuthDialog />
      <ProfileDialog />
      <SettingsDialog />
      <ThreadSearchDialog />
      <McpSettings />
    </div>
  );
}
