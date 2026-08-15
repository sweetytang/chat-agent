import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, Moon, Sun } from 'lucide-react';

import { ThemePreference } from '@/app/domain/theme';
import { useTheme } from '@/app/hooks/useTheme';
import type { ThemePreference as ThemePreferenceType } from '@/app/store/ui';

import styles from './index.module.css';

const options: { value: ThemePreferenceType; label: string }[] = [
  { value: ThemePreference.Light, label: '浅色' },
  { value: ThemePreference.Dark, label: '深色' },
  { value: ThemePreference.System, label: '跟随系统' },
];

export function ThemeMenu() {
  const { preference, setPreference } = useTheme();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={styles.trigger} aria-label="切换主题">
        <Sun className={styles.sun} size={18} />
        <Moon className={styles.moon} size={18} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.menu} align="end" sideOffset={8}>
          <DropdownMenu.Label className={styles.label}>外观</DropdownMenu.Label>
          {options.map((option) => (
            <DropdownMenu.Item
              className={styles.item}
              key={option.value}
              onSelect={() => setPreference(option.value)}
            >
              {option.label}
              {preference === option.value && <Check size={15} />}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
