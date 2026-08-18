import { memo, useState } from 'react';

import { MessageContent } from '@/modules/chat/components/MessageContent';
import { TimelineBranchControls } from '@/modules/timeline/components/TimelineBranchControls';
import type { MessageItem } from '@/modules/timeline/types';

import styles from './index.module.css';

interface MessageBubbleProps {
  message: MessageItem;
  disabled?: boolean;
  onBranchSwitch: (checkpointId: string) => void;
  onEdit: (message: MessageItem, content: string) => void;
  onRegenerate: (message: MessageItem) => void;
}

function MessageBubbleComponent({
  message,
  disabled = false,
  onBranchSwitch,
  onEdit,
  onRegenerate,
}: MessageBubbleProps) {
  const [draft, setDraft] = useState(message.content);
  const [isEditing, setIsEditing] = useState(false);
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  function cancelEditing() {
    setDraft(message.content);
    setIsEditing(false);
  }

  function submitEdit() {
    const content = draft.trim();
    if (!content || disabled) return;
    setIsEditing(false);
    onEdit(message, content);
  }

  return (
    <article className={`${styles.row} ${isUser ? styles.userRow : styles.assistantRow}`}>
      <div className={`${styles.bubble} ${isUser ? styles.userBubble : styles.assistantBubble}`}>
        {isEditing ? (
          <div className={styles.editor}>
            <textarea
              aria-label="编辑消息"
              disabled={disabled}
              onChange={(event) => setDraft(event.target.value)}
              rows={3}
              value={draft}
            />
            <div className={styles.editActions}>
              <button disabled={disabled || !draft.trim()} onClick={submitEdit} type="button">
                保存并分支
              </button>
              <button disabled={disabled} onClick={cancelEditing} type="button">
                取消
              </button>
            </div>
          </div>
        ) : (
          <>
            {message.content ? <MessageContent content={message.content} /> : '…'}
            {message.terminal_segment && (isUser || isAssistant) && (
              <div className={styles.actions}>
                <TimelineBranchControls
                  disabled={disabled}
                  item={message}
                  onSwitch={onBranchSwitch}
                />
                {isUser && (
                  <button disabled={disabled} onClick={() => setIsEditing(true)} type="button">
                    编辑
                  </button>
                )}
                {isAssistant && (
                  <button disabled={disabled} onClick={() => onRegenerate(message)} type="button">
                    重新生成
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </article>
  );
}

export const MessageBubble = memo(
  MessageBubbleComponent,
  (previous, next) => previous.message === next.message && previous.disabled === next.disabled,
);
