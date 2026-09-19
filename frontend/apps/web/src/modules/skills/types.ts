export interface Skill {
  id: string;
  user_id: string;
  name: string;
  description: string;
  content: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface SkillCreatePayload {
  name: string;
  description: string;
  content: string;
  enabled?: boolean;
}

export interface SkillImportPayload {
  raw_content: string;
  name?: string | null;
  description?: string | null;
  enabled?: boolean;
}

export interface SkillUpdatePayload {
  name?: string | null;
  description?: string | null;
  content?: string | null;
  enabled?: boolean | null;
}
