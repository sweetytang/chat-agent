import { Sparkles } from 'lucide-react';
import { useEffect, useRef } from 'react';

import type { Skill } from '../../types';

import styles from './index.module.css';

interface SkillSlashMenuProps {
  skills: Skill[];
  activeIndex: number;
  selectedSkillIds?: string[];
  onSelect: (skill: Skill) => void;
}

export function SkillSlashMenu({
  skills,
  activeIndex,
  selectedSkillIds = [],
  onSelect,
}: SkillSlashMenuProps) {
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const activeEl = container.children[activeIndex + 1] as HTMLElement | undefined;
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  return (
    <div ref={listRef} className={styles.menu} role="listbox" aria-label="快捷技能选择">
      <div className={styles.header}>
        <span>选择技能 (SKILL)</span>
        <span>回车确认</span>
      </div>
      {skills.length === 0 ? (
        <div className={styles.empty}>未找到匹配的启用技能</div>
      ) : (
        skills.map((skill, index) => {
          const isSelected = selectedSkillIds.includes(skill.id);
          return (
            <button
              key={skill.id}
              type="button"
              className={`${styles.item} ${index === activeIndex ? styles.itemActive : ''}`}
              onClick={() => onSelect(skill)}
              role="option"
              aria-selected={index === activeIndex}
            >
              <div className={styles.itemTop}>
                <span className={styles.itemTitle}>
                  <Sparkles size={13} style={{ color: 'var(--accent)' }} />
                  {skill.name}
                </span>
                <span className={`${styles.slashPill} ${isSelected ? styles.slashPillSelected : ''}`}>
                  {isSelected ? '✓ 已选用' : `/${skill.name}`}
                </span>
              </div>
              <div className={styles.itemDesc}>{skill.description}</div>
            </button>
          );
        })
      )}
    </div>
  );
}
