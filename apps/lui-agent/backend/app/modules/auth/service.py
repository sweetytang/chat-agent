from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password, verify_password
from app.db.models import User


async def register_user(session: AsyncSession, email: str, password: str) -> User:
    existing = await session.scalar(select(User).where(User.email == email))
    if existing:
        raise ValueError("用户已存在")
    user = User(id=uuid4(), email=email, password_hash=hash_password(password))
    session.add(user)
    await session.flush()
    return user


async def authenticate_user(session: AsyncSession, email: str, password: str) -> str:
    user = await session.scalar(select(User).where(User.email == email))
    if user is None or not verify_password(password, user.password_hash):
        raise ValueError("用户名或密码错误")
    return create_access_token(str(user.id))
