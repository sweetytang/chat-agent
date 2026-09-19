import { create } from 'zustand';

import {
  deleteSkill,
  importSkill,
  listSkills,
  updateSkill,
} from '../services/skillsApi';
import type { Skill } from '../types';

interface SkillsState {
  skills: Skill[];
  isLoading: boolean;
  selectedSkillIds: string[];
  loadSkills: () => Promise<void>;
  setSelectedSkillIds: (ids: string[]) => void;
  toggleSelectSkill: (id: string) => void;
  clearSelectedSkills: () => void;
  toggleSkill: (id: string, enabled: boolean) => Promise<void>;
  importSkillMarkdown: (rawContent: string) => Promise<Skill>;
  removeSkill: (id: string) => Promise<void>;
}

export const useSkillsStore = create<SkillsState>((set, get) => ({
  skills: [],
  isLoading: false,
  selectedSkillIds: [],

  loadSkills: async () => {
    set({ isLoading: true });
    try {
      const skills = await listSkills();
      set({ skills, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  setSelectedSkillIds: (selectedSkillIds) => set({ selectedSkillIds }),

  toggleSelectSkill: (id) =>
    set((state) => {
      const exists = state.selectedSkillIds.includes(id);
      return {
        selectedSkillIds: exists
          ? state.selectedSkillIds.filter((item) => item !== id)
          : [...state.selectedSkillIds, id],
      };
    }),

  clearSelectedSkills: () => set({ selectedSkillIds: [] }),

  toggleSkill: async (id, enabled) => {
    // 乐观更新
    set((state) => ({
      skills: state.skills.map((s) => (s.id === id ? { ...s, enabled } : s)),
      // 如果禁用了某技能，且当前被选中，则移出选中
      selectedSkillIds: enabled
        ? state.selectedSkillIds
        : state.selectedSkillIds.filter((item) => item !== id),
    }));
    try {
      await updateSkill(id, { enabled });
    } catch {
      // 失败回滚
      await get().loadSkills();
    }
  },

  importSkillMarkdown: async (rawContent: string) => {
    set({ isLoading: true });
    try {
      const created = await importSkill({ raw_content: rawContent });
      await get().loadSkills();
      return created;
    } finally {
      set({ isLoading: false });
    }
  },

  removeSkill: async (id: string) => {
    set((state) => ({
      skills: state.skills.filter((s) => s.id !== id),
      selectedSkillIds: state.selectedSkillIds.filter((item) => item !== id),
    }));
    try {
      await deleteSkill(id);
    } catch {
      await get().loadSkills();
    }
  },
}));
