import { AlertCircle, RotateCcw } from 'lucide-react';

import styles from './index.module.css';

export function InlineErrorCard({
  message,
  canRetry,
  onRetry,
}: {
  message: string;
  canRetry: boolean;
  onRetry: () => void;
}) {
  return (
    <section className={styles.card} role="alert">
      <AlertCircle size={18} />
      <div>
        <strong>运行遇到问题</strong>
        <p>{message}</p>
      </div>
      {canRetry && (
        <button onClick={onRetry} type="button">
          <RotateCcw size={15} />
          重试
        </button>
      )}
    </section>
  );
}
