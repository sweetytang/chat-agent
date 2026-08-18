import * as Collapsible from '@radix-ui/react-collapsible';
import { Brain, ChevronDown } from 'lucide-react';
import { useState } from 'react';

import type { ReasoningItem } from '@/modules/timeline/types';

import styles from './index.module.css';

export function ReasoningBlock({ item }: { item: ReasoningItem }) {
  const [expanded, setExpanded] = useState(false);
  const open = item.status === 'streaming' || expanded;

  return (
    <Collapsible.Root className={styles.card} onOpenChange={setExpanded} open={open}>
      <Collapsible.Trigger className={styles.trigger}>
        <span>
          <Brain size={17} />
          {item.status === 'streaming' ? '正在思考' : '思考过程'}
        </span>
        <ChevronDown size={16} />
      </Collapsible.Trigger>
      <Collapsible.Content className={styles.content}>{item.content}</Collapsible.Content>
    </Collapsible.Root>
  );
}
