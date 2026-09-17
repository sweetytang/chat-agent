from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import jwt
from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.models import User
from app.db.session import get_db_session

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")
optional_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token", auto_error=False)
password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    return password_hash.verify(password, hashed_password)


def create_access_token(subject: str, expires_minutes: int = 30) -> str:
    """创建访问令牌，默认 30 分钟过期。"""
    now = datetime.now(UTC)
    payload = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=expires_minutes)).timestamp()),
    }
    return jwt.encode(payload, get_settings().jwt_secret, algorithm="HS256")


def get_subject(token: Annotated[str, Depends(oauth2_scheme)]) -> str:
    """从访问令牌中提取用户标识。"""
    try:
        payload = jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])
        subject = payload.get("sub")
    except (jwt.InvalidTokenError, TypeError) as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="无效的访问令牌"
        ) from error
    if not isinstance(subject, str) or not subject:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="访问令牌缺少用户标识")
    return subject


def get_optional_subject(
    token: Annotated[str | None, Depends(optional_oauth2_scheme)],
) -> str | None:
    if token is None:
        return None
    return get_subject(token)


def current_user_uuid(subject: str = Depends(get_subject)) -> UUID:
    """提取当前登录用户的 UUID。"""

    if subject is None:
        raise HTTPException(status_code=401, detail="需要登录后访问该资源")
    try:
        return UUID(subject)
    except ValueError as error:
        raise HTTPException(status_code=401, detail="无效用户身份") from error


async def current_user(
    user_id: UUID = Depends(current_user_uuid), session: AsyncSession = Depends(get_db_session)
) -> User:
    user = await session.scalar(select(User).where(User.id == user_id))
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户不存在")
    return user
