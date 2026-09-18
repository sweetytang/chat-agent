import * as Dialog from '@radix-ui/react-dialog';
import { GitBranch, Moon, Palette, Settings, Sliders, Sun, User, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ThemePreference } from '@/app/domain/theme';
import { useTheme } from '@/app/hooks/useTheme';
import { useUiStore } from '@/app/store/ui';
import { useAuthStore } from '@/modules/auth/store/auth';

import styles from './index.module.css';

type TabKey = 'general' | 'features' | 'account';

export function SettingsDialog() {
  const open = useUiStore((state) => state.settingsDialogOpen);
  const setOpen = useUiStore((state) => state.setSettingsDialogOpen);
  const [activeTab, setActiveTab] = useState<TabKey>('general');

  // 常规：主题
  const { preference, setPreference } = useTheme();

  // 功能：分枝聊天
  const branchChatEnabled = useUiStore((state) => state.branchChatEnabled);
  const setBranchChatEnabled = useUiStore((state) => state.setBranchChatEnabled);

  // 账户：姓名
  const email = useAuthStore((state) => state.email);
  const name = useAuthStore((state) => state.name);
  const updateName = useAuthStore((state) => state.updateName);
  const [nameInput, setNameInput] = useState(name ?? '');
  const [saving, setSaving] = useState(false);
  const [savedTip, setSavedTip] = useState(false);

  useEffect(() => {
    setNameInput(name ?? '');
  }, [name, open]);

  async function handleSaveName() {
    setSaving(true);
    const ok = await updateName(nameInput.trim() || null);
    setSaving(false);
    if (ok) {
      setSavedTip(true);
      setTimeout(() => setSavedTip(false), 2000);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.dialog} aria-describedby={undefined}>
          <div className={styles.header}>
            <div className={styles.titleGroup}>
              <Settings size={18} className={styles.titleIcon} />
              <Dialog.Title className={styles.title}>系统设置</Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button type="button" className={styles.closeBtn} aria-label="关闭">
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          <div className={styles.container}>
            {/* 左侧 Tab 导航 */}
            <aside className={styles.nav}>
              <button
                type="button"
                className={`${styles.navItem} ${activeTab === 'general' ? styles.navItemActive : ''}`}
                onClick={() => setActiveTab('general')}
              >
                <Sliders size={16} />
                <span>常规</span>
              </button>
              <button
                type="button"
                className={`${styles.navItem} ${activeTab === 'features' ? styles.navItemActive : ''}`}
                onClick={() => setActiveTab('features')}
              >
                <GitBranch size={16} />
                <span>功能</span>
              </button>
              <button
                type="button"
                className={`${styles.navItem} ${activeTab === 'account' ? styles.navItemActive : ''}`}
                onClick={() => {
                  setActiveTab('account');
                  setNameInput(name ?? '');
                }}
              >
                <User size={16} />
                <span>账户</span>
              </button>
            </aside>

            {/* 右侧设置项主体 */}
            <main className={styles.content}>
              {activeTab === 'general' && (
                <div className={styles.tabContent}>
                  <div className={styles.sectionHeader}>
                    <h3>外观与偏好</h3>
                    <p>管理界面的色彩主题及显示方式。</p>
                  </div>

                  <div className={styles.settingCard}>
                    <div className={styles.settingRow}>
                      <div className={styles.settingInfo}>
                        <span className={styles.settingLabel}>主题模式</span>
                        <span className={styles.settingDesc}>选择界面的深色或浅色风格</span>
                      </div>
                      <div className={styles.themeOptions}>
                        {[
                          { value: ThemePreference.Light, label: '浅色', icon: <Sun size={14} /> },
                          { value: ThemePreference.Dark, label: '深色', icon: <Moon size={14} /> },
                          { value: ThemePreference.System, label: '系统', icon: <Palette size={14} /> },
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            className={`${styles.themeBtn} ${preference === opt.value ? styles.themeBtnActive : ''}`}
                            onClick={() => setPreference(opt.value)}
                          >
                            {opt.icon}
                            <span>{opt.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'features' && (
                <div className={styles.tabContent}>
                  <div className={styles.sectionHeader}>
                    <h3>智能体功能</h3>
                    <p>调整对话与运行时的特性开关。</p>
                  </div>

                  <div className={styles.settingCard}>
                    <div className={styles.settingRow}>
                      <div className={styles.settingInfo}>
                        <span className={styles.settingLabel}>分枝聊天 (Branching)</span>
                        <span className={styles.settingDesc}>
                          允许在编辑历史消息时开辟分支，并支持在时间线上左右切换历史版本
                        </span>
                      </div>
                      <label className={styles.switch}>
                        <input
                          type="checkbox"
                          checked={branchChatEnabled}
                          onChange={(e) => setBranchChatEnabled(e.target.checked)}
                        />
                        <span className={styles.slider} />
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'account' && (
                <div className={styles.tabContent}>
                  <div className={styles.sectionHeader}>
                    <h3>账户设置</h3>
                    <p>管理个人身份信息与展示偏好。</p>
                  </div>

                  <div className={styles.settingCard}>
                    <div className={styles.settingCol}>
                      <div className={styles.settingInfo}>
                        <span className={styles.settingLabel}>姓名</span>
                        <span className={styles.settingDesc}>
                          自定义在侧边栏和对话中显示的姓名（默认为邮箱账号）
                        </span>
                      </div>
                      <div className={styles.inputGroup}>
                        <input
                          type="text"
                          className={styles.textInput}
                          placeholder={email ?? '请输入姓名'}
                          value={nameInput}
                          disabled={saving}
                          onChange={(e) => setNameInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void handleSaveName();
                          }}
                        />
                        <button
                          type="button"
                          className={styles.saveBtn}
                          disabled={saving}
                          onClick={() => void handleSaveName()}
                        >
                          {saving ? '保存中…' : savedTip ? '已保存' : '保存'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </main>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
