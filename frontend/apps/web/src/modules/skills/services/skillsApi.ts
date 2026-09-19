import { request } from '@/shared/http/client';

import type {
  Skill,
  SkillCreatePayload,
  SkillImportPayload,
  SkillUpdatePayload,
} from '../types';

export function listSkills(): Promise<Skill[]> {
  return request<Skill[]>('/skills');
}

export function createSkill(payload: SkillCreatePayload): Promise<Skill> {
  return request<Skill>('/skills', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function importSkill(payload: SkillImportPayload): Promise<Skill> {
  return request<Skill>('/skills/import', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateSkill(skillId: string, payload: SkillUpdatePayload): Promise<Skill> {
  return request<Skill>(`/skills/${skillId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteSkill(skillId: string): Promise<void> {
  return request<void>(`/skills/${skillId}`, {
    method: 'DELETE',
  });
}
