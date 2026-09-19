import { ArrowUp, LockKeyhole, Square } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
} from 'react';

import { useSkillsStore } from '@/modules/skills/store/skills';
import { ModelSelector } from '@/modules/chat/components/ModelSelector';
import { SkillSlashMenu } from '@/modules/skills/components/SkillSlashMenu';
import { shouldSubmitComposer } from '@/modules/chat/domain/composer';
import type { Skill } from '@/modules/skills/types';

import styles from './index.module.css';

interface ChatComposerProps {
  value: string;
  disabled: boolean;
  running: boolean;
  selectedModel: string;
  onSelectModel: (model: string) => void;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
}

export const ChatComposer = forwardRef(function ChatComposer(
  {
    value,
    disabled,
    running,
    selectedModel,
    onSelectModel,
    onChange,
    onSubmit,
    onStop,
  }: ChatComposerProps,
  forwardedRef: Ref<HTMLTextAreaElement>,
) {
  const localRef = useRef<HTMLTextAreaElement | null>(null);

  const skills = useSkillsStore((state) => state.skills);
  const selectedSkillIds = useSkillsStore((state) => state.selectedSkillIds);
  const toggleSelectSkill = useSkillsStore((state) => state.toggleSelectSkill);

  const enabledSkills = useMemo(() => skills.filter((s) => s.enabled), [skills]);
  const activeSkills = useMemo(
    () => skills.filter((s) => selectedSkillIds.includes(s.id)),
    [skills, selectedSkillIds],
  );

  // 检测末尾或光标前的 /query
  const slashMatch = useMemo(() => {
    const match = /(?:^|\s)\/([a-zA-Z0-9_-]*)$/.exec(value);
    return match ? match[1] : null;
  }, [value]);

  const [slashDismissed, setSlashDismissed] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);

  useEffect(() => {
    if (slashMatch === null) {
      setSlashDismissed(false);
      setSlashIndex(0);
    }
  }, [slashMatch]);

  const filteredSkills = useMemo(() => {
    if (slashMatch === null || slashDismissed) return [];
    const query = slashMatch.toLowerCase();
    return enabledSkills.filter(
      (s) =>
        s.name.toLowerCase().includes(query) ||
        s.description.toLowerCase().includes(query),
    );
  }, [enabledSkills, slashMatch, slashDismissed]);

  const isSlashOpen = filteredSkills.length > 0;

  function assignRef(element: HTMLTextAreaElement | null) {
    localRef.current = element;
    if (typeof forwardedRef === 'function') forwardedRef(element);
    else if (forwardedRef) forwardedRef.current = element;
  }

  function handleSelectFromSlash(skill: Skill) {
    if (!selectedSkillIds.includes(skill.id)) {
      toggleSelectSkill(skill.id);
    }
    const nextVal = value.replace(/(?:^|\s)\/([a-zA-Z0-9_-]*)$/, '').trim();
    onChange(nextVal ? `${nextVal} ` : '');
    setSlashDismissed(true);
    localRef.current?.focus();
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (isSlashOpen) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSlashIndex((i) => (i + 1) % filteredSkills.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSlashIndex((i) => (i - 1 + filteredSkills.length) % filteredSkills.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        const picked = filteredSkills[slashIndex];
        if (picked) {
          handleSelectFromSlash(picked);
        }
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setSlashDismissed(true);
        return;
      }
    }

    // 输入框无文本时，按退格键（Backspace）一键整个删除最后一个选中的技能词
    if (event.key === 'Backspace' && !value && selectedSkillIds.length > 0) {
      const lastId = selectedSkillIds[selectedSkillIds.length - 1];
      toggleSelectSkill(lastId);
      return;
    }

    if (
      shouldSubmitComposer({
        key: event.key,
        shiftKey: event.shiftKey,
        isComposing: event.nativeEvent.isComposing,
      })
    ) {
      event.preventDefault();
      if (!disabled && !running && value.trim()) onSubmit();
    }
  }

  useEffect(() => {
    const textarea = localRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 150 ? 'auto' : 'hidden';
  }, [value]);

  return (
    <div className={`${styles.composer} ${disabled ? styles.disabled : ''}`}>
      {isSlashOpen && (
        <SkillSlashMenu
          skills={filteredSkills}
          activeIndex={slashIndex}
          selectedSkillIds={selectedSkillIds}
          onSelect={handleSelectFromSlash}
        />
      )}

      {/* 像自然文字一样连续流动的输入容器：技能词与文本输入浑然一体 */}
      <div
        className={styles.editorFlow}
        onClick={() => localRef.current?.focus()}
      >
        {activeSkills.map((skill) => (
          <span
            key={skill.id}
            className={styles.skillTextWord}
            title={`${skill.name}: ${skill.description} (按退格键整个删除)`}
          >
            <span className={styles.skillTextPrefix}>/</span>
            <span className={styles.skillTextName}>{skill.name}</span>
          </span>
        ))}
        <textarea
          ref={assignRef}
          value={value}
          disabled={disabled}
          rows={1}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={keyDown}
          aria-label="消息"
          placeholder={
            disabled
              ? '登录后开始对话'
              : activeSkills.length > 0
                ? '继续输入内容...'
                : '输入消息，输入 / 快捷调用技能...'
          }
        />
      </div>

      {/* 底部工具条：模型选择器和发送按钮均靠右下侧排列 */}
      <div className={styles.bottomBar}>
        <div className={styles.actions}>
          <ModelSelector
            disabled={disabled || running}
            onSelectModel={onSelectModel}
            selectedModel={selectedModel}
          />
          <button
            className={running ? styles.stop : styles.send}
            disabled={!running && (disabled || !value.trim())}
            onClick={running ? onStop : onSubmit}
            type="button"
            aria-label={running ? '停止运行' : '发送消息'}
          >
            {running ? (
              <Square size={15} fill="currentColor" />
            ) : disabled ? (
              <LockKeyhole size={16} />
            ) : (
              <ArrowUp size={19} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
});
