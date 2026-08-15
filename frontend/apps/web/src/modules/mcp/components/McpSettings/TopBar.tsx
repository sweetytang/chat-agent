import { X } from 'lucide-react';

import styles from './index.module.css';

interface TopBarProps {
  onClose: () => void;
}

export function TopBar({ onClose }: TopBarProps) {
  return (
    <header className={styles.topbar}>
      <div className={styles.productTitle}>
        <strong>MCP Server 管理</strong>
        <span>连接外部工具，并精确控制向模型暴露的能力</span>
      </div>
      <nav className={styles.categoryTabs} aria-label="扩展分类">
        <button className={styles.categoryActive} type="button">
          MCP
        </button>
        <button type="button" disabled title="即将开放">
          Skills
        </button>
        <button type="button" disabled title="即将开放">
          Plugins
        </button>
      </nav>
      <button className={styles.iconButton} onClick={onClose} aria-label="关闭 MCP 管理">
        <X size={18} />
      </button>
    </header>
  );
}
