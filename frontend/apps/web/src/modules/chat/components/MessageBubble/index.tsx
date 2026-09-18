import { Check, ChevronDown, ChevronUp, Copy, Pencil, RotateCw } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';

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

const COLLAPSED_BUBBLE_HEIGHT = 114; // 未编辑态：4 行文字高度约 114px
const LINE_HEIGHT = 22.4; // 14px 字体, 1.6 行高
const PADDING = 24; // 上下 padding 各 12px
const MAX_EDIT_HEIGHT = PADDING + 10 * LINE_HEIGHT; // 最大 10 行高度约 248px

function MessageBubbleComponent({
  message,
  disabled = false,
  onBranchSwitch,
  onEdit,
  onRegenerate,
}: MessageBubbleProps) {
  const [draft, setDraft] = useState(message.content);
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bubbleContentRef = useRef<HTMLDivElement | null>(null);

  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  // 1. 未编辑状态：判断内容是否超过 4 行（约 114px），如果是，则在气泡卡片内部右下角展示“展开/收起”角标
  useEffect(() => {
    if (!isUser || isEditing || !bubbleContentRef.current) return;
    const el = bubbleContentRef.current;
    setCanExpand(el.scrollHeight > COLLAPSED_BUBBLE_HEIGHT + 4);
  }, [message.content, isUser, isEditing]);

  // 2. 点击编辑状态：
  //    - 输入框初始 1 行
  //    - 随着输入自动增加行数
  //    - 最大限制 10 行，超过 10 行时出现滚动条
  useEffect(() => {
    if (!isEditing || !textareaRef.current) return;
    const el = textareaRef.current;
    el.style.height = 'auto';

    const actualHeight = el.scrollHeight;
    if (actualHeight <= MAX_EDIT_HEIGHT) {
      el.style.height = `${actualHeight}px`;
      el.style.overflowY = 'hidden';
    } else {
      el.style.height = `${MAX_EDIT_HEIGHT}px`;
      el.style.overflowY = 'auto';
    }
  }, [draft, isEditing]);

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

  async function handleCopy() {
    if (!message.content) return;
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* 复制降级 */
    }
  }

  return (
    <article className={`${styles.row} ${isUser ? styles.userRow : styles.assistantRow}`}>
      <div
        className={`${styles.wrapper} ${
          isUser ? styles.userWrapper : styles.assistantWrapper
        } ${isEditing ? styles.editingWrapper : ''}`}
      >
        {isEditing ? (
          /* 编辑模式：宽度 100% 最大，初始 1 行随输入自增，最大 10 行，没有任何角标 */
          <div className={styles.editor}>
            <textarea
              ref={textareaRef}
              aria-label="编辑消息"
              autoFocus
              disabled={disabled}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                  event.preventDefault();
                  submitEdit();
                }
                if (event.key === 'Escape') {
                  cancelEditing();
                }
              }}
              rows={1}
              value={draft}
            />
            <div className={styles.editActions}>
              <button
                className={styles.cancelBtn}
                disabled={disabled}
                onClick={cancelEditing}
                type="button"
              >
                取消
              </button>
              <button
                className={styles.submitBtn}
                disabled={disabled || !draft.trim()}
                onClick={submitEdit}
                type="button"
              >
                更新
              </button>
            </div>
          </div>
        ) : (
          /* 未编辑状态 */
          <>
            {/* 纯内容气泡卡片：超过 4 行且收起时截断并显示内部右下角展开箭头 */}
            <div
              ref={bubbleContentRef}
              className={`${styles.bubble} ${
                isUser ? styles.userBubble : styles.assistantBubble
              } ${isUser && canExpand && !isExpanded ? styles.collapsedBubble : ''}`}
            >
              {message.content ? <MessageContent content={message.content} /> : '…'}

              {/* 仅在未编辑状态下、且超出 4 行时才出现右下角展开角标 */}
              {isUser && canExpand && (
                <button
                  aria-label={isExpanded ? '收起为 4 行' : '展开查看全部'}
                  className={styles.bubbleExpandBtn}
                  onClick={() => setIsExpanded((prev) => !prev)}
                  title={isExpanded ? '收起为 4 行' : '展开查看完整内容'}
                  type="button"
                >
                  {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
              )}
            </div>

            {/* 操作角标区：完全置于卡片背景色之外 */}
            {message.terminal_segment && (isUser || isAssistant) && (
              <div
                className={`${styles.actions} ${isUser ? styles.userActions : styles.assistantActions}`}
              >
                {/* 历史版本分支切换器 */}
                <TimelineBranchControls
                  disabled={disabled}
                  item={message}
                  onSwitch={onBranchSwitch}
                />

                {/* 复制按钮 */}
                <button
                  aria-label={copied ? '已复制' : '复制内容'}
                  className={`${styles.iconBtn} ${copied ? styles.copied : ''}`}
                  disabled={!message.content}
                  onClick={() => void handleCopy()}
                  title={copied ? '已复制' : '复制'}
                  type="button"
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                </button>

                {/* 用户气泡：编辑按钮 */}
                {isUser && (
                  <button
                    aria-label="编辑消息"
                    className={styles.iconBtn}
                    disabled={disabled}
                    onClick={() => {
                      setDraft(message.content);
                      setIsEditing(true);
                    }}
                    title="编辑"
                    type="button"
                  >
                    <Pencil size={13} />
                  </button>
                )}

                {/* AI 气泡：重新生成按钮 */}
                {isAssistant && (
                  <button
                    aria-label="重新生成回答"
                    className={styles.iconBtn}
                    disabled={disabled}
                    onClick={() => onRegenerate(message)}
                    title="重新生成"
                    type="button"
                  >
                    <RotateCw size={13} />
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
