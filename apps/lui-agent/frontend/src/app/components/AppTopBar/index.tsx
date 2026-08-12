import { ThemeMenu } from '@/app/components/ThemeMenu';

import styles from './index.module.css';

export function AppTopBar() {
  return (
    <header className={styles.bar}>
      <ThemeMenu />
    </header>
  );
}
