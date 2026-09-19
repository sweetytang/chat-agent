from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Skill
from app.modules.skills.schemas import SkillUpdate


class SkillRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_user_skills(self, user_id: UUID, *, enabled_only: bool = False) -> list[Skill]:
        query = select(Skill).where(Skill.user_id == user_id)
        if enabled_only:
            query = query.where(Skill.enabled.is_(True))
        query = query.order_by(Skill.created_at.desc())
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def get_user_skill(self, user_id: UUID, skill_id: UUID) -> Skill | None:
        result = await self.session.execute(
            select(Skill).where(Skill.id == skill_id, Skill.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def get_user_skills_by_ids(self, user_id: UUID, skill_ids: list[UUID]) -> list[Skill]:
        if not skill_ids:
            return []
        result = await self.session.execute(
            select(Skill).where(
                Skill.user_id == user_id,
                Skill.id.in_(skill_ids),
                Skill.enabled.is_(True),
            )
        )
        return list(result.scalars().all())

    async def get_user_skill_by_name(self, user_id: UUID, name: str) -> Skill | None:
        result = await self.session.execute(
            select(Skill).where(Skill.name == name, Skill.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def create_or_upsert_skill(
        self,
        user_id: UUID,
        *,
        name: str,
        description: str,
        content: str,
        enabled: bool = True,
    ) -> Skill:
        existing = await self.get_user_skill_by_name(user_id, name)
        if existing is not None:
            existing.description = description
            existing.content = content
            existing.enabled = enabled
            await self.session.flush()
            return existing

        skill = Skill(
            user_id=user_id,
            name=name,
            description=description,
            content=content,
            enabled=enabled,
        )
        self.session.add(skill)
        await self.session.flush()
        return skill

    async def update_skill(
        self, user_id: UUID, skill_id: UUID, payload: SkillUpdate
    ) -> Skill | None:
        skill = await self.get_user_skill(user_id, skill_id)
        if skill is None:
            return None

        if payload.name is not None:
            skill.name = payload.name
        if payload.description is not None:
            skill.description = payload.description
        if payload.content is not None:
            skill.content = payload.content
        if payload.enabled is not None:
            skill.enabled = payload.enabled

        await self.session.flush()
        return skill

    async def delete_skill(self, user_id: UUID, skill_id: UUID) -> bool:
        skill = await self.get_user_skill(user_id, skill_id)
        if skill is None:
            return False

        await self.session.delete(skill)
        await self.session.flush()
        return True
