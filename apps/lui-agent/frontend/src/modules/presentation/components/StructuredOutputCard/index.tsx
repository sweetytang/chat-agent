import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronDown, ListTree } from 'lucide-react';

import styles from './index.module.css';

export function StructuredOutputCard({ value }: { value: Record<string, unknown> }) {
  const text = typeof value.value === 'string' ? value.value : null;
  return (
    <Collapsible.Root className={styles.card} defaultOpen>
      <Collapsible.Trigger className={styles.trigger}>
        <span>
          <ListTree size={17} />
          结构化输出
        </span>
        <ChevronDown size={17} />
      </Collapsible.Trigger>
      <Collapsible.Content className={styles.content}>
        {text ? <p>{text}</p> : <pre>{JSON.stringify(value, null, 2)}</pre>}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
