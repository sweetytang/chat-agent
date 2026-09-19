from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import current_user_uuid
from app.db.session import get_db_session
from app.modules.skills.domain import parse_skill_markdown
from app.modules.skills.repository import SkillRepository
from app.modules.skills.schemas import (
    SkillCreate,
    SkillImportRequest,
    SkillResponse,
    SkillUpdate,
)

router = APIRouter(prefix="/api/skills", tags=["skills"])


@router.get("", response_model=list[SkillResponse])
async def list_skills(
    user_id: UUID = Depends(current_user_uuid),
    session: AsyncSession = Depends(get_db_session),
) -> list[SkillResponse]:
    skills = await SkillRepository(session).list_user_skills(user_id)
    return [SkillResponse.model_validate(s) for s in skills]


@router.post("", response_model=SkillResponse, status_code=status.HTTP_201_CREATED)
async def create_skill(
    payload: SkillCreate,
    user_id: UUID = Depends(current_user_uuid),
    session: AsyncSession = Depends(get_db_session),
) -> SkillResponse:
    skill = await SkillRepository(session).create_or_upsert_skill(
        user_id,
        name=payload.name.strip(),
        description=payload.description.strip(),
        content=payload.content.strip(),
        enabled=payload.enabled,
    )
    await session.commit()
    return SkillResponse.model_validate(skill)


@router.post("/import", response_model=SkillResponse, status_code=status.HTTP_201_CREATED)
async def import_skill_file(
    payload: SkillImportRequest,
    user_id: UUID = Depends(current_user_uuid),
    session: AsyncSession = Depends(get_db_session),
) -> SkillResponse:
    try:
        name, description, content = parse_skill_markdown(
            payload.raw_content,
            fallback_name=payload.name,
            fallback_description=payload.description,
        )
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(err),
        ) from err

    skill = await SkillRepository(session).create_or_upsert_skill(
        user_id,
        name=name,
        description=description,
        content=content,
        enabled=payload.enabled,
    )
    await session.commit()
    return SkillResponse.model_validate(skill)


@router.get("/{skill_id}", response_model=SkillResponse)
async def get_skill(
    skill_id: UUID,
    user_id: UUID = Depends(current_user_uuid),
    session: AsyncSession = Depends(get_db_session),
) -> SkillResponse:
    skill = await SkillRepository(session).get_user_skill(user_id, skill_id)
    if skill is None:
        raise HTTPException(status_code=404, detail="技能不存在")
    return SkillResponse.model_validate(skill)


@router.patch("/{skill_id}", response_model=SkillResponse)
async def patch_skill(
    skill_id: UUID,
    payload: SkillUpdate,
    user_id: UUID = Depends(current_user_uuid),
    session: AsyncSession = Depends(get_db_session),
) -> SkillResponse:
    skill = await SkillRepository(session).update_skill(user_id, skill_id, payload)
    if skill is None:
        raise HTTPException(status_code=404, detail="技能不存在")
    await session.commit()
    return SkillResponse.model_validate(skill)


@router.delete("/{skill_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_skill(
    skill_id: UUID,
    user_id: UUID = Depends(current_user_uuid),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    deleted = await SkillRepository(session).delete_skill(user_id, skill_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="技能不存在")
    await session.commit()
