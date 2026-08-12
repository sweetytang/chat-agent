import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MoreHorizontal, Pin, Pencil, Trash2, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';

import { useThreadStore } from '@/modules/threads/store/thread';
import type { ThreadSummary } from '@/modules/threads/types/thread';

import styles from './index.module.css';

interface ThreadActionsProps {
  disabled: boolean;
  thread: ThreadSummary;
  onDeleted?: () => void;
}

type DialogKind = 'rename' | 'delete' | null;

export function ThreadActions({ disabled, thread, onDeleted }: ThreadActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [title, setTitle] = useState(thread.title ?? '未命名会话');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const descriptionId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function openDialog(kind: Exclude<DialogKind, null>) {
    if (kind === 'rename') setTitle(thread.title ?? '未命名会话');
    setError(null);
    setDialog(kind);
  }

  async function rename() {
    const nextTitle = title.trim();
    if (!nextTitle) {
      setError('标题不能为空');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await useThreadStore.getState().renameThread(thread.id, nextTitle);
      setDialog(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '重命名失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function togglePinned() {
    try {
      await useThreadStore.getState().setThreadPinned(thread.id, !thread.is_pinned);
    } catch {
      /* 列表保持后端已确认的状态。 */
    }
  }

  async function remove() {
    setSubmitting(true);
    setError(null);
    try {
      await useThreadStore.getState().deleteThread(thread.id);
      setDialog(null);
      onDeleted?.();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '删除失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenu.Trigger
          ref={triggerRef}
          className={styles.trigger}
          data-open={menuOpen ? '' : undefined}
          disabled={disabled}
          aria-label={`管理会话：${thread.title ?? '未命名会话'}`}
          type="button"
        >
          <MoreHorizontal size={18} />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={styles.menu} align="end" sideOffset={4}>
            <DropdownMenu.Item className={styles.menuItem} onSelect={() => openDialog('rename')}>
              <Pencil size={16} />
              Rename
            </DropdownMenu.Item>
            <DropdownMenu.Item className={styles.menuItem} onSelect={() => void togglePinned()}>
              <Pin size={16} />
              {thread.is_pinned ? 'Unpin chat' : 'Pin chat'}
            </DropdownMenu.Item>
            <DropdownMenu.Separator className={styles.separator} />
            <DropdownMenu.Item
              className={`${styles.menuItem} ${styles.dangerItem}`}
              onSelect={() => openDialog('delete')}
            >
              <Trash2 size={16} />
              Delete
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <Dialog.Root open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.overlay} />
          <Dialog.Content
            className={styles.dialog}
            aria-describedby={descriptionId}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              triggerRef.current?.focus();
            }}
            onOpenAutoFocus={(event) => {
              if (dialog !== 'rename') return;
              event.preventDefault();
              inputRef.current?.focus();
              inputRef.current?.select();
            }}
          >
            <Dialog.Close className={styles.close} aria-label="关闭">
              <X size={18} />
            </Dialog.Close>
            <Dialog.Title className={styles.title}>
              {dialog === 'rename' ? '重命名会话' : '删除会话？'}
            </Dialog.Title>
            <Dialog.Description className={styles.description} id={descriptionId}>
              {dialog === 'rename'
                ? '输入一个便于识别的会话标题。'
                : '此操作会永久删除该会话及其消息，无法撤销。'}
            </Dialog.Description>
            {dialog === 'rename' && (
              <input
                className={styles.input}
                maxLength={255}
                onChange={(event) => setTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.nativeEvent.isComposing) void rename();
                }}
                ref={inputRef}
                value={title}
                aria-label="会话标题"
              />
            )}
            {error && <p className={styles.error}>{error}</p>}
            <div className={styles.actions}>
              <Dialog.Close className={styles.cancel} disabled={submitting}>
                取消
              </Dialog.Close>
              <button
                className={dialog === 'delete' ? styles.deleteButton : styles.save}
                disabled={submitting || (dialog === 'rename' && !title.trim())}
                onClick={() => void (dialog === 'rename' ? rename() : remove())}
                type="button"
              >
                {dialog === 'rename' ? '保存' : '删除'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
