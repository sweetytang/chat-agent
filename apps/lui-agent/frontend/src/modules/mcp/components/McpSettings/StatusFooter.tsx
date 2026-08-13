import { AlertCircle, CheckCircle2, X } from 'lucide-react';

import styles from './index.module.css';

interface StatusFooterProps {
  error: string | null;
  notice: string | null;
  exposedTools: number;
  onDismiss: () => void;
}

export function StatusFooter({ error, notice, exposedTools, onDismiss }: StatusFooterProps) {
  return (
    <>
      {(error ?? notice) && (
        <div className={`${styles.toast} ${error ? styles.toastError : ''}`}>
          {error ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          <span>{error ?? notice}</span>
          <button type="button" aria-label="关闭提示" onClick={onDismiss}>
            <X size={14} />
          </button>
        </div>
      )}
      <footer className={styles.footer}>
        <span>
          已暴露 {exposedTools} 个工具，预计占用约 ~{Math.max(0.1, exposedTools * 0.1).toFixed(1)}k
          Token 上下文
        </span>
        <span>禁用不常用工具可提升模型响应效率</span>
      </footer>
    </>
  );
}
