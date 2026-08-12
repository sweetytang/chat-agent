import { Menu } from 'lucide-react';

import { BrandMark } from '@/app/components/BrandMark';
import { ThemeMenu } from '@/app/components/ThemeMenu';

import styles from './index.module.css';

interface AppTopBarProps {
  onToggleSidebar: () => void;
}

export function AppTopBar({ onToggleSidebar }: AppTopBarProps) {
  return (
    <header className={styles.bar}>
      <div className={styles.left}>
        <button
          className={styles.toggle}
          onClick={onToggleSidebar}
          type="button"
          aria-label="打开会话菜单"
        >
          <Menu size={20} />
        </button>
        <BrandMark size={27} />
        <strong>LUI Agent</strong>
      </div>
      <ThemeMenu />
    </header>
  );
}
