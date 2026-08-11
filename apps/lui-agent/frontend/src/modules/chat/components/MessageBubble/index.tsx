import { useEffect, useState } from "react";

import { BranchSwitcher } from "@/modules/checkpoints/components/BranchSwitcher";
import { getMessageBranchIndex } from "@/modules/checkpoints/domain/history";
import { MessageContent } from "@/modules/chat/components/MessageContent";
import type { HistoryMessage } from "@/modules/threads/types/history";
import styles from "./index.module.css";

interface MessageBubbleProps {
  message: HistoryMessage;
  disabled?: boolean;
  onBranchSwitch: (checkpointId: string) => void;
  onEdit: (message: HistoryMessage, content: string) => void;
  onRegenerate: (message: HistoryMessage) => void;
}

export function MessageBubble({
  message,
  disabled = false,
  onBranchSwitch,
  onEdit,
  onRegenerate,
}: MessageBubbleProps) {
  const [draft, setDraft] = useState(message.content);
  const [isEditing, setIsEditing] = useState(false);
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const branchIndex = getMessageBranchIndex(message);

  useEffect(() => {
    setDraft(message.content);
    setIsEditing(false);
  }, [message.id]);

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

  return <article className={`${styles.row} ${isUser ? styles.userRow : styles.assistantRow}`}>
    <div className={`${styles.bubble} ${isUser ? styles.userBubble : styles.assistantBubble}`}>
      {isEditing ? <div className={styles.editor}>
        <textarea
          aria-label="编辑消息"
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          rows={3}
          value={draft}
        />
        <div className={styles.editActions}>
          <button disabled={disabled || !draft.trim()} onClick={submitEdit} type="button">保存并分支</button>
          <button disabled={disabled} onClick={cancelEditing} type="button">取消</button>
        </div>
      </div> : <>
        {message.content ? <MessageContent content={message.content} /> : "…"}
        {(isUser || isAssistant) && <div className={styles.actions}>
          <BranchSwitcher
            branchOptions={message.branch_options}
            currentIndex={branchIndex}
            disabled={disabled}
            onSwitch={onBranchSwitch}
          />
          {isUser && <button disabled={disabled} onClick={() => setIsEditing(true)} type="button">编辑</button>}
          {isAssistant && <button disabled={disabled} onClick={() => onRegenerate(message)} type="button">重新生成</button>}
        </div>}
      </>}
    </div>
  </article>;
}
