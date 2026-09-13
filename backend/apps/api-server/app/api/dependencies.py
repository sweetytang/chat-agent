from uuid import UUID

from fastapi import Depends, HTTPException

from app.core.security import get_subject
from app.db.models import Thread
from app.modules.runs.repository import RunRepository
from sqlalchemy.ext.asyncio import AsyncSession


def current_user_uuid(subject: str = Depends(get_subject)) -> UUID:
    """提取当前登录用户的 UUID。"""
    
    return require_user_uuid(subject)


def require_user_uuid(subject: str | None) -> UUID:
    """解析登录主体，若为空或格式错误则抛出 401。"""
    if subject is None:
        raise HTTPException(status_code=401, detail="需要登录后访问该资源")
    try:
        return UUID(subject)
    except ValueError as error:
        raise HTTPException(status_code=401, detail="无效用户身份") from error



__all__ = [
    "current_user_uuid",
    "require_user_uuid",
]