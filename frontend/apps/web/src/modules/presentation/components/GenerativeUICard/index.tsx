import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronDown, LayoutTemplate } from 'lucide-react';

import styles from './index.module.css';

export function GenerativeUICard({ value }: { value: Record<string, unknown> }) {
  const component = value.component === 'NoticeCard' ? 'NoticeCard' : '安全展示卡片';
  const text = typeof value.text === 'string' ? value.text : JSON.stringify(value.props ?? value);
  return (
    <Collapsible.Root className={styles.card} defaultOpen>
      <Collapsible.Trigger className={styles.trigger}>
        <span>
          <LayoutTemplate size={17} />
          生成式界面 · {component}
        </span>
        <ChevronDown size={17} />
      </Collapsible.Trigger>
      <Collapsible.Content className={styles.content}>
        <p>{text}</p>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
