import * as Dialog from '@radix-ui/react-dialog';
import { Check, Edit2, Mail, Shield, User, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useUiStore } from '@/app/store/ui';
import { useAuthStore } from '@/modules/auth/store/auth';

import styles from './index.module.css';

export function ProfileDialog() {
  const open = useUiStore((state) => state.profileDialogOpen);
  const setOpen = useUiStore((state) => state.setProfileDialogOpen);
  const email = useAuthStore((state) => state.email);
  const role = useAuthStore((state) => state.role);
  const name = useAuthStore((state) => state.name);
  const updateName = useAuthStore((state) => state.updateName);

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(name ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNameInput(name ?? '');
  }, [name, open]);

  const roleLabel = role === 'ADMIN' ? '管理员' : '普通用户';
  const shownName = name || email || '已登录用户';
  const initial = shownName.charAt(0).toUpperCase();

  async function handleSaveName() {
    setSaving(true);
    await updateName(nameInput.trim() || null);
    setSaving(false);
    setIsEditingName(false);
  }

  function handleCancelEdit() {
    setNameInput(name ?? '');
    setIsEditingName(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.dialog} aria-describedby={undefined}>
          <div className={styles.header}>
            <div className={styles.titleGroup}>
              <User size={18} className={styles.titleIcon} />
              <Dialog.Title className={styles.title}>个人资料</Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button type="button" className={styles.closeBtn} aria-label="关闭">
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          <div className={styles.body}>
            {/* 头像与概览区 */}
            <div className={styles.avatarSection}>
              <div className={styles.avatarLarge}>{initial}</div>
              <div className={styles.avatarMeta}>
                <span className={styles.nameText}>{shownName}</span>
                <span className={styles.roleText}>{roleLabel}</span>
              </div>
            </div>

            {/* 详细信息卡片 */}
            <div className={styles.card}>
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>
                  <Mail size={14} /> 绑定邮箱
                </span>
                <span className={styles.fieldValue}>{email ?? '-'}</span>
              </div>

              <div className={styles.divider} />

              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>
                  <User size={14} /> 姓名
                </span>

                {isEditingName ? (
                  <div className={styles.nameEditGroup}>
                    <input
                      autoFocus
                      className={styles.nameInput}
                      disabled={saving}
                      onChange={(e) => setNameInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleSaveName();
                        if (e.key === 'Escape') handleCancelEdit();
                      }}
                      placeholder="设置姓名"
                      type="text"
                      value={nameInput}
                    />
                    <button
                      className={styles.saveActionBtn}
                      disabled={saving}
                      onClick={() => void handleSaveName()}
                      title="保存"
                      type="button"
                    >
                      <Check size={13} />
                    </button>
                    <button
                      className={styles.cancelActionBtn}
                      disabled={saving}
                      onClick={handleCancelEdit}
                      title="取消"
                      type="button"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <div className={styles.valueWithAction}>
                    <span className={styles.fieldValue}>{name || '与邮箱一致'}</span>
                    <button
                      className={styles.editBtn}
                      onClick={() => setIsEditingName(true)}
                      title="修改姓名"
                      type="button"
                    >
                      <Edit2 size={13} />
                      <span>修改</span>
                    </button>
                  </div>
                )}
              </div>

              <div className={styles.divider} />

              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>
                  <Shield size={14} /> 账户权限
                </span>
                <span className={role === 'ADMIN' ? styles.adminBadge : styles.badge}>
                  {roleLabel}
                </span>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
