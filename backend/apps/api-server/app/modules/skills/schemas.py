from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SkillBase(BaseModel):
    name: str = Field(..., max_length=128, description="技能唯一标识，如 react-expert")
    description: str = Field(..., description="技能描述及触发时机，供模型决策使用")
    content: str = Field(..., description="SKILL.md 正文 Markdown 内容")
    enabled: bool = Field(default=True, description="是否启用")


class SkillCreate(SkillBase):
    pass


class SkillImportRequest(BaseModel):
    raw_content: str = Field(..., description="SKILL.md 文件原始文本内容")
    name: str | None = Field(default=None, max_length=128, description="覆盖技能名（可选）")
    description: str | None = Field(default=None, description="覆盖描述（可选）")
    enabled: bool = Field(default=True, description="是否启用")


class SkillUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=128)
    description: str | None = None
    content: str | None = None
    enabled: bool | None = None


class SkillResponse(SkillBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime
