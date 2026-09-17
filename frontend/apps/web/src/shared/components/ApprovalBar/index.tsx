import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown, Edit3, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { useState } from 'react';

import styles from './index.module.css';

export interface ApprovalBarProps {
  title?: string;
  toolName?: string;
  initialArguments?: Record<string, unknown>;
  disabled?: boolean;
  resolving?: boolean;
  onDecision: (
    decision: 'approve' | 'approve_always' | 'edit' | 'reject',
    payload?: Record<string, unknown>,
  ) => void;
}

export function ApprovalBar({
  title = '需要授权执行',
  initialArguments = {},
  disabled = false,
  resolving = false,
  onDecision,
}: ApprovalBarProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedJson, setEditedJson] = useState(() => JSON.stringify(initialArguments, null, 2));
  const [editError, setEditError] = useState<string | null>(null);

  function handleEditSubmit() {
    try {
      let parsed = null;
      try {
        parsed = JSON.parse(editedJson);
      } catch {
        parsed = null;
      }
      if (typeof parsed !== 'object' || parsed === null) {
        setEditError('必须输入合法的 JSON 对象');
        return;
      }
      setEditError(null);
      setIsEditing(false);
      onDecision('edit', { arguments: parsed });
    } catch {
      setEditError('JSON 语法错误，请检查入参');
    }
  }

  return (
    <div className={styles.panel} role="alert">
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <span className={styles.badge}>
            <ShieldAlert size={12} />
            <span>审核请求</span>
          </span>
          <span className={styles.titleText}>
            {resolving ? '正在恢复执行…' : title}
          </span>
        </div>

        <div className={styles.controls}>
          {/* 精致的分体式批准按钮 (Split Button) */}
          <div className={styles.splitGroup}>
            <button
              className={styles.primaryAction}
              disabled={disabled || resolving}
              onClick={() => onDecision('approve')}
              type="button"
            >
              <Check size={13} />
              <span>批准</span>
            </button>

            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  aria-label="展开授权选项"
                  className={styles.triggerAction}
                  disabled={disabled || resolving}
                  type="button"
                >
                  <ChevronDown size={13} />
                </button>
              </DropdownMenu.Trigger>

              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" className={styles.menuContent} sideOffset={6}>
                  <DropdownMenu.Item
                    className={styles.menuItem}
                    onSelect={() => onDecision('approve')}
                  >
                    <span className={styles.menuItemIcon}><Check size={13} /></span>
                    <span>仅批准本次</span>
                  </DropdownMenu.Item>

                  <DropdownMenu.Item
                    className={styles.menuItem}
                    onSelect={() => onDecision('approve_always')}
                  >
                    <span className={styles.menuItemIcon}><ShieldCheck size={13} /></span>
                    <span>本次会话始终允许</span>
                  </DropdownMenu.Item>

                  <DropdownMenu.Separator className={styles.menuSeparator} />

                  <DropdownMenu.Item
                    className={styles.menuItem}
                    onSelect={() => {
                      setIsEditing(true);
                      setEditedJson(JSON.stringify(initialArguments, null, 2));
                    }}
                  >
                    <span className={styles.menuItemIcon}><Edit3 size={13} /></span>
                    <span>编辑参数并执行…</span>
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>

          {/* 拒绝按钮 */}
          <button
            className={styles.rejectAction}
            disabled={disabled || resolving}
            onClick={() => onDecision('reject')}
            type="button"
          >
            <X size={13} />
            <span>拒绝</span>
          </button>
        </div>
      </div>

      {/* 参数编辑抽屉区域 */}
      {isEditing && (
        <div className={styles.editArea}>
          <div className={styles.editLabel}>修改工具入参 (JSON)：</div>
          <textarea
            className={styles.jsonInput}
            onChange={(e) => {
              setEditedJson(e.target.value);
              setEditError(null);
            }}
            value={editedJson}
          />
          {editError && <div className={styles.errorTip}>{editError}</div>}
          <div className={styles.editFooter}>
            <button
              className={styles.cancelBtn}
              onClick={() => setIsEditing(false)}
              type="button"
            >
              取消
            </button>
            <button
              className={styles.submitBtn}
              onClick={handleEditSubmit}
              type="button"
            >
              提交修改并执行
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
