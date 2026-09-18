import { ArrowUp, LockKeyhole, Square } from 'lucide-react';
import { forwardRef, useEffect, useRef, type KeyboardEvent, type Ref } from 'react';

import { ModelSelector } from '@/modules/chat/components/ModelSelector';
import { shouldSubmitComposer } from '@/modules/chat/domain/composer';

import styles from './index.module.css';

interface ChatComposerProps {
  value: string;
  disabled: boolean;
  running: boolean;
  selectedModel: string;
  onSelectModel: (model: string) => void;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
}

export const ChatComposer = forwardRef(function ChatComposer(
  {
    value,
    disabled,
    running,
    selectedModel,
    onSelectModel,
    onChange,
    onSubmit,
    onStop,
  }: ChatComposerProps,
  forwardedRef: Ref<HTMLTextAreaElement>,
) {
  const localRef = useRef<HTMLTextAreaElement | null>(null);

  function assignRef(element: HTMLTextAreaElement | null) {
    localRef.current = element;
    if (typeof forwardedRef === 'function') forwardedRef(element);
    else if (forwardedRef) forwardedRef.current = element;
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      shouldSubmitComposer({
        key: event.key,
        shiftKey: event.shiftKey,
        isComposing: event.nativeEvent.isComposing,
      })
    ) {
      event.preventDefault();
      if (!disabled && !running && value.trim()) onSubmit();
    }
  }

  useEffect(() => {
    const textarea = localRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 180 ? 'auto' : 'hidden';
  }, [value]);

  return (
    <div className={`${styles.composer} ${disabled ? styles.disabled : ''}`}>
      <textarea
        ref={assignRef}
        value={value}
        disabled={disabled}
        rows={1}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={keyDown}
        aria-label="消息"
        placeholder={disabled ? '登录后开始对话' : '发送消息'}
      />
      <div className={styles.bottomBar}>
        <span className={styles.hint}>
          {disabled ? '需要先登录' : 'Enter 发送 · Shift + Enter 换行'}
        </span>

        <div className={styles.actions}>
          <ModelSelector
            disabled={disabled || running}
            onSelectModel={onSelectModel}
            selectedModel={selectedModel}
          />
          <button
            className={running ? styles.stop : styles.send}
            disabled={!running && (disabled || !value.trim())}
            onClick={running ? onStop : onSubmit}
            type="button"
            aria-label={running ? '停止运行' : '发送消息'}
          >
            {running ? (
              <Square size={15} fill="currentColor" />
            ) : disabled ? (
              <LockKeyhole size={16} />
            ) : (
              <ArrowUp size={19} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
});
