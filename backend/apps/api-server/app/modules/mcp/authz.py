from uuid import UUID

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_subject
from app.db.models import User, UserRole
from app.db.session import get_db_session


async def current_user(
    subject: str = Depends(get_subject), session: AsyncSession = Depends(get_db_session)
) -> User:
    try:
        user_id = UUID(subject)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="无效用户身份"
        ) from error
    user = await session.scalar(select(User).where(User.id == user_id))
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户不存在")
    return user


async def admin_user(user: User = Depends(current_user)) -> User:
    if user.role is not UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要管理员权限")
    return user
