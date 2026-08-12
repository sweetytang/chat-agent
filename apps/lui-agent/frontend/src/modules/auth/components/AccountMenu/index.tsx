import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Tooltip from '@radix-ui/react-tooltip';
import { LogOut } from 'lucide-react';

import { useAuthStore } from '@/modules/auth/store/auth';

import styles from './index.module.css';

interface AccountMenuProps {
  compact?: boolean;
}

export function AccountMenu({ compact = false }: AccountMenuProps) {
  const email = useAuthStore((state) => state.email);
  const label = email ?? '已登录账户';
  const trigger = (
    <DropdownMenu.Trigger
      className={`${styles.trigger} ${compact ? styles.compact : ''}`}
      aria-label={compact ? '打开账户菜单' : undefined}
    >
      <span className={styles.avatar}>{email?.charAt(0).toUpperCase() ?? 'U'}</span>
      {!compact && (
        <span className={styles.identity}>
          <strong>{label}</strong>
          <small>账户已连接</small>
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
              账户菜单
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
          <DropdownMenu.Item
            className={styles.item}
            onSelect={() => void useAuthStore.getState().logout()}
          >
            <LogOut size={16} />
            退出登录
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
