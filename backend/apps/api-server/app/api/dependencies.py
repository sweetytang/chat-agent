from uuid import UUID

from fastapi import Depends, HTTPException

from app.core.security import get_subject


def current_user_uuid(subject: str = Depends(get_subject)) -> UUID:
    """提取当前登录用户的 UUID。"""
    
    try:
        return UUID(subject)
    except ValueError as error:
        raise HTTPException(
            status_code=401,
            detail="无效用户身份"
        ) from error


__all__ = [
    "current_user_uuid",
]