import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Tooltip from '@radix-ui/react-tooltip';
import { LogOut, Settings, User } from 'lucide-react';

import { useUiStore } from '@/app/store/ui';
import { useAuthStore } from '@/modules/auth/store/auth';

import styles from './index.module.css';

interface AccountMenuProps {
  compact?: boolean;
}

export function AccountMenu({ compact = false }: AccountMenuProps) {
  const name = useAuthStore((state) => state.name);
  const role = useAuthStore((state) => state.role);
  const setProfileDialogOpen = useUiStore((state) => state.setProfileDialogOpen);
  const setSettingsDialogOpen = useUiStore((state) => state.setSettingsDialogOpen);

  const shownName = name || '';
  const roleLabel = !role ? '' : (role === 'ADMIN' ? '管理员' : '普通用户');
  const initial = shownName.charAt(0).toUpperCase();

  const trigger = (
    <DropdownMenu.Trigger
      className={`${styles.trigger} ${compact ? styles.compact : ''}`}
      aria-label={compact ? '打开账户菜单' : undefined}
    >
      <span className={styles.avatar}>{initial}</span>
      {!compact && (
        <span className={styles.identity}>
          <span className={styles.identityName}>{shownName}</span>
          <small className={styles.identityRole}>{roleLabel}</small>
        </span>
      )}
    </DropdownMenu.Trigger>
  );

  return (
    <DropdownMenu.Root>
      {compact ? (
        <Tooltip.Root>
          <Tooltip.Trigger asChild>{trigger}</Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content className={styles.tooltip} side="right" sideOffset={8}>
              账户与设置
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      ) : (
        trigger
      )}

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={styles.menu}
          side={compact ? 'right' : 'top'}
          align="start"
          sideOffset={8}
        >
          {/* 1. 最上面一块：账户展示项 */}
          {/* <div className={styles.accountHeader}>
            <span className={styles.avatarMini}>{initial}</span>
            <div className={styles.accountInfo}>
              <span className={styles.accountName}>{shownName}</span>
              <span className={styles.accountRole}>{roleLabel}</span>
            </div>
          </div>

          <div className={styles.separator} /> */}

          {/* 2. 中间一块：“个人资料”、“设置” */}
          <div className={styles.section}>
            <DropdownMenu.Item
              className={styles.item}
              onSelect={() => setProfileDialogOpen(true)}
            >
              <span className={styles.itemIcon}><User size={15} /></span>
              <span>个人资料</span>
            </DropdownMenu.Item>

            <DropdownMenu.Item
              className={styles.item}
              onSelect={() => setSettingsDialogOpen(true)}
            >
              <span className={styles.itemIcon}><Settings size={15} /></span>
              <span>设置</span>
            </DropdownMenu.Item>
          </div>

          <div className={styles.separator} />

          {/* 3. 最下面一块：“退出登录” */}
          <div className={styles.section}>
            <DropdownMenu.Item
              className={`${styles.item} ${styles.logoutItem}`}
              onSelect={() => void useAuthStore.getState().logout()}
            >
              <span className={styles.itemIcon}><LogOut size={15} /></span>
              <span>退出登录</span>
            </DropdownMenu.Item>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
