import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { BrandMark } from '@/app/components/BrandMark';
import { useUiStore } from '@/app/store/ui';
import { useAuthStore } from '@/modules/auth/store/auth';

import styles from './index.module.css';

export function AuthDialog() {
  const open = useUiStore((state) => state.authDialogOpen);
  const setOpen = useUiStore((state) => state.setAuthDialogOpen);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const error = useAuthStore((state) => state.error);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (mode === 'register' && password !== confirmPassword) return;
    setIsSubmitting(true);
    const action =
      mode === 'register' ? useAuthStore.getState().register : useAuthStore.getState().login;
    const success = await action(email, password);
    setIsSubmitting(false);
    if (success) {
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setOpen(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.dialog} aria-describedby="auth-description">
          <Dialog.Close className={styles.close} aria-label="关闭登录窗口">
            <X size={19} />
          </Dialog.Close>
          <div className={styles.brand}>
            <BrandMark size={40} />
          </div>
          <Dialog.Title className={styles.title}>
            {mode === 'login' ? '欢迎回来' : '创建账户'}
          </Dialog.Title>
          <Dialog.Description className={styles.description} id="auth-description">
            {mode === 'login' ? '登录后继续你的 Agent 会话' : '注册后即可保存和管理会话'}
          </Dialog.Description>
          <form className={styles.form} onSubmit={(event) => void submit(event)}>
            <label>
              邮箱
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label>
              密码
              <input
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            {mode === 'register' && (
              <label>
                确认密码
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
              </label>
            )}
            {mode === 'register' && confirmPassword && password !== confirmPassword && (
              <p className={styles.error}>两次密码不一致</p>
            )}
            {error && <p className={styles.error}>{error}</p>}
            <button
              className={styles.submit}
              disabled={isSubmitting || (mode === 'register' && password !== confirmPassword)}
              type="submit"
            >
              {isSubmitting ? '请稍候…' : mode === 'login' ? '登录' : '注册并进入'}
            </button>
          </form>
          <button
            className={styles.switch}
            type="button"
            onClick={() => setMode((value) => (value === 'login' ? 'register' : 'login'))}
          >
            {mode === 'login' ? '没有账户？立即注册' : '已有账户？返回登录'}
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
