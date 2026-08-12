import * as Dialog from '@radix-ui/react-dialog';
import { MessageCircle, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useUiStore } from '@/app/store/ui';
import { useAuthStore } from '@/modules/auth/store/auth';
import { filterThreads } from '@/modules/threads/domain/search';
import { useThreadStore } from '@/modules/threads/store/thread';

import styles from './index.module.css';

export function ThreadSearchDialog() {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const open = useUiStore((state) => state.threadSearchOpen);
  const token = useAuthStore((state) => state.token);
  const threads = useThreadStore((state) => state.threads);
  const results = useMemo(() => filterThreads(threads, query), [query, threads]);

  useEffect(() => {
    if (open && token) void useThreadStore.getState().loadThreads();
  }, [open, token]);

  function setOpen(nextOpen: boolean) {
    if (!nextOpen) setQuery('');
    useUiStore.getState().setThreadSearchOpen(nextOpen);
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={styles.dialog}
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <Dialog.Title className={styles.title}>搜索会话</Dialog.Title>
          <div className={styles.searchBar}>
            <Search size={21} />
            <input
              aria-label="搜索会话"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索会话…"
              ref={inputRef}
              value={query}
            />
            <Dialog.Close className={styles.close} aria-label="关闭搜索面板">
              <X size={22} />
            </Dialog.Close>
          </div>
          <section className={styles.results} aria-label="会话搜索结果">
            <h2>{query ? '搜索结果' : '最近会话'}</h2>
            {!token ? (
              <p className={styles.empty}>登录后可搜索历史会话。</p>
            ) : results.length === 0 ? (
              <p className={styles.empty}>{query ? '没有匹配的会话' : '还没有保存的会话'}</p>
            ) : (
              <div className={styles.list}>
                {results.map((thread) => (
                  <button
                    className={styles.result}
                    key={thread.id}
                    onClick={() => {
                      useThreadStore
                        .getState()
                        .setThread(
                          thread.id,
                          thread.title ?? '新对话',
                          thread.current_checkpoint_id,
                        );
                      useUiStore.getState().setMobileSidebarOpen(false);
                      setOpen(false);
                    }}
                    type="button"
                  >
                    <MessageCircle size={19} />
                    <span>{thread.title ?? '未命名会话'}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
