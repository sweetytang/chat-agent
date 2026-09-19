import * as Dialog from '@radix-ui/react-dialog';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ChangeEvent } from 'react';

import { useUiStore } from '@/app/store/ui';
import { useSkillsStore } from '../../store/skills';
import type { Skill } from '../../types';

import styles from './index.module.css';

export function SkillsDialog() {
  const open = useUiStore((state) => state.skillsDialogOpen);
  const setOpen = useUiStore((state) => state.setSkillsDialogOpen);

  const skills = useSkillsStore((state) => state.skills);
  const selectedSkillIds = useSkillsStore((state) => state.selectedSkillIds);
  const toggleSelectSkill = useSkillsStore((state) => state.toggleSelectSkill);
  const clearSelectedSkills = useSkillsStore((state) => state.clearSelectedSkills);
  const loadSkills = useSkillsStore((state) => state.loadSkills);
  const toggleSkill = useSkillsStore((state) => state.toggleSkill);
  const removeSkill = useSkillsStore((state) => state.removeSkill);
  const importSkillMarkdown = useSkillsStore((state) => state.importSkillMarkdown);

  // isImporting 控制是否切换到专门的“上传/解析 SKILL.md”独占视图
  const [isImporting, setIsImporting] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedSkillIds, setExpandedSkillIds] = useState<Set<string>>(new Set());

  const selectedSkills = useMemo(
    () => skills.filter((s) => selectedSkillIds.includes(s.id)),
    [skills, selectedSkillIds],
  );

  useEffect(() => {
    if (open) {
      void loadSkills();
    } else {
      setIsImporting(false);
      setImportText('');
      setImportError(null);
      setIsSubmitting(false);
    }
  }, [open, loadSkills]);

  function toggleExpand(id: string) {
    setExpandedSkillIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleImportSubmit() {
    if (!importText.trim() || isSubmitting) return;
    setImportError(null);
    setIsSubmitting(true);
    try {
      await importSkillMarkdown(importText);
      // 解析保存成功后，清空草稿并自动切回技能列表视图
      setImportText('');
      setIsImporting(false);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : '导入失败，请检查格式');
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === 'string') {
        setImportText(text);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  function handleCloseImportView() {
    setIsImporting(false);
    setImportText('');
    setImportError(null);
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.dialog} aria-describedby={undefined}>
          {/* 顶栏 Header */}
          <div className={styles.header}>
            <div className={styles.titleGroup}>
              {isImporting ? (
                <button
                  type="button"
                  onClick={handleCloseImportView}
                  className={styles.backBtn}
                  title="返回技能列表"
                >
                  <ArrowLeft size={16} />
                  <span>返回</span>
                </button>
              ) : (
                <span className={styles.icon}>
                  <Sparkles size={20} />
                </span>
              )}
              <div>
                <Dialog.Title className={styles.titleGroup} asChild>
                  <h2>{isImporting ? '导入技能手册' : '技能管理'}</h2>
                </Dialog.Title>
                <p>
                  {isImporting
                    ? '粘贴或上传 SKILL.md，系统自动提取配置并注册到技能库'
                    : '管理个人专精技能，支持在输入框键入 / 快捷调用与多选组合'}
                </p>
              </div>
            </div>
            <div className={styles.actions}>
              {!isImporting && (
                <button
                  className={styles.actionBtn}
                  onClick={() => setIsImporting(true)}
                  type="button"
                >
                  <Plus size={15} />
                  导入技能
                </button>
              )}
              <Dialog.Close asChild>
                <button className={styles.closeBtn} type="button" aria-label="关闭">
                  <X size={17} />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* 内容区 Body */}
          <div className={styles.body}>
            {/* 场景 A：独立独占的“导入 SKILL.md”视图 */}
            {isImporting ? (
              <div className={styles.importView}>
                <div className={styles.importViewTop}>
                  <span className={styles.importBoxTitle}>
                    <FileText size={16} />
                    SKILL.md 原始内容
                  </span>
                  <span className={styles.importBoxDesc}>
                    支持标准 YAML Frontmatter（包含 name 与 description）
                  </span>
                </div>

                <textarea
                  className={styles.importTextarea}
                  placeholder={`---\nname: react-expert\ndescription: React 性能调优与组件架构指南\n---\n\n# 角色规范\n1. 优先使用函数式组件与 Hooks...\n2. 关注避免无效重渲染...`}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  autoFocus
                />

                {importError && (
                  <div className={styles.importErrorText}>
                    {importError}
                  </div>
                )}

                <div className={styles.importFooter}>
                  <label className={styles.fileUploadLabel}>
                    <Upload size={14} />
                    从本地文件导入 (.md)
                    <input
                      type="file"
                      accept=".md,.txt,.markdown"
                      className={styles.fileInput}
                      onChange={handleFileUpload}
                    />
                  </label>

                  <div className={styles.importFooterActions}>
                    <button
                      className={styles.cancelImportBtn}
                      onClick={handleCloseImportView}
                      type="button"
                    >
                      取消
                    </button>
                    <button
                      className={styles.saveImportBtn}
                      disabled={!importText.trim() || isSubmitting}
                      onClick={() => void handleImportSubmit()}
                      type="button"
                    >
                      {isSubmitting ? '解析中...' : '解析并保存'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* 场景 B：默认视图 —— 当前模式横幅 + 技能列表 */
              <>
                {/* 技能模式横幅：展示当前生效模式（自动查阅 vs 显式指定） */}
                <div className={styles.modeBanner}>
                  <div className={styles.modeInfo}>
                    <Sparkles size={18} className={styles.modeIcon} />
                    <div className={styles.modeText}>
                      <span className={styles.modeTitle}>
                        {selectedSkills.length > 0
                          ? `已指定 ${selectedSkills.length} 个专精技能: ${selectedSkills.map((s) => s.name).join('、')}`
                          : '当前模式: 自动按需 (大模型自主查阅)'}
                      </span>
                      <span className={styles.modeDesc}>
                        {selectedSkills.length > 0
                          ? '提问时将直接载入已选技能正文作为首位指导规范（支持多选组合生效）'
                          : '系统将启用的技能目录供大模型按需自主调用 load_skill 工具查阅'}
                      </span>
                    </div>
                  </div>
                  <div className={styles.modeActions}>
                    <button
                      type="button"
                      className={`${styles.autoModeBtn} ${selectedSkillIds.length === 0 ? styles.autoModeBtnActive : ''}`}
                      onClick={clearSelectedSkills}
                    >
                      {selectedSkillIds.length === 0 ? <Check size={13} /> : null}
                      {selectedSkillIds.length === 0 ? '自动按需模式' : '清空并恢复自动'}
                    </button>
                  </div>
                </div>

                {skills.length === 0 ? (
                  <div className={styles.emptyState}>
                    <Sparkles size={36} className={styles.emptyIcon} />
                    <h3>暂无专属技能</h3>
                    <p>
                      点击右上角“导入技能”，粘贴或上传标准 <code>SKILL.md</code>，大模型将在对话中按需自主调用。
                    </p>
                    <button
                      className={styles.actionBtn}
                      onClick={() => setIsImporting(true)}
                      type="button"
                    >
                      <Plus size={15} />
                      立即导入第一个技能
                    </button>
                  </div>
                ) : (
                  <div className={styles.skillList}>
                    {skills.map((skill: Skill) => {
                      const isExpanded = expandedSkillIds.has(skill.id);
                      const isCurrentActive = selectedSkillIds.includes(skill.id);
                      return (
                        <div key={skill.id} className={styles.skillCard}>
                          <div className={styles.skillHeader}>
                            <div className={styles.skillMeta}>
                              <div className={styles.skillTitleRow}>
                                <span className={styles.skillName}>{skill.name}</span>
                              </div>
                              <span className={styles.skillDesc}>{skill.description}</span>
                            </div>

                            <div className={styles.skillControls}>
                              {skill.enabled && (
                                <button
                                  type="button"
                                  className={`${styles.selectActionBtn} ${isCurrentActive ? styles.selectActionBtnSelected : ''}`}
                                  onClick={() => toggleSelectSkill(skill.id)}
                                >
                                  {isCurrentActive ? (
                                    <>
                                      <Check size={12} />
                                      已指定 (点击取消)
                                    </>
                                  ) : (
                                    '+ 指定此技能'
                                  )}
                                </button>
                              )}

                              <label
                                className={styles.switch}
                                title={skill.enabled ? '点击禁用' : '点击启用'}
                              >
                                <input
                                  type="checkbox"
                                  checked={skill.enabled}
                                  onChange={(e) => void toggleSkill(skill.id, e.target.checked)}
                                />
                                <span className={styles.slider} />
                              </label>

                              <button
                                className={styles.iconBtn}
                                onClick={() => void removeSkill(skill.id)}
                                type="button"
                                title="删除技能"
                                aria-label={`删除 ${skill.name}`}
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>

                          <button
                            className={styles.contentToggleBtn}
                            onClick={() => toggleExpand(skill.id)}
                            type="button"
                          >
                            {isExpanded ? (
                              <>
                                <ChevronUp size={13} />
                                收起手册内容
                              </>
                            ) : (
                              <>
                                <ChevronDown size={13} />
                                查看手册正文 ({skill.content.length} 字)
                              </>
                            )}
                          </button>

                          {isExpanded && (
                            <pre className={styles.previewContent}>{skill.content}</pre>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
