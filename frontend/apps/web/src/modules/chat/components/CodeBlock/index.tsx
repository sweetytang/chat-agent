import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

import styles from './index.module.css';

export function CodeBlock({ children, className }: { children: string; className?: string }) {
  const [feedback, setFeedback] = useState<'idle' | 'copied' | 'failed'>('idle');
  async function copy() {
    try {
      await navigator.clipboard.writeText(children.replace(/\n$/, ''));
      setFeedback('copied');
    } catch {
      setFeedback('failed');
    }
    window.setTimeout(() => setFeedback('idle'), 1500);
  }
  return (
    <div className={styles.block}>
      <div className={styles.toolbar}>
        <span>{className?.replace('language-', '') ?? '代码'}</span>
        <button onClick={() => void copy()} type="button">
          {feedback === 'copied' ? <Check size={14} /> : <Copy size={14} />}
          {feedback === 'copied' ? '已复制' : feedback === 'failed' ? '复制失败' : '复制'}
        </button>
      </div>
      <pre>
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}
