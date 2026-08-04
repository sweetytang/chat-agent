from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field, field_validator
from typing import Annotated

from app.core.security import create_access_token, get_subject
from app.db.session import get_db_session
from app.modules.auth.service import authenticate_user, register_user
from app.modules.auth.refresh_tokens import RefreshTokenError, create_refresh_token, rotate_refresh_token, revoke_refresh_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


class AuthRequest(BaseModel):
    email: str
    password: str = Field(min_length=8)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        value = value.strip().lower()
        if "@" not in value or value.startswith("@") or value.endswith("@"):
            raise ValueError("请输入有效邮箱")
        return value


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    refresh_token: str | None = None


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=20)


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: AuthRequest, session: Annotated[AsyncSession, Depends(get_db_session)]) -> AuthResponse:
    try:
        user = await register_user(session, payload.email, payload.password)
        await session.commit()
        refresh_token, _ = await create_refresh_token(session, user.id)
        await session.commit()
        return AuthResponse(access_token=create_access_token(str(user.id)), refresh_token=refresh_token)
    except ValueError as error:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.post("/token", response_model=AuthResponse)
async def login(payload: AuthRequest, session: Annotated[AsyncSession, Depends(get_db_session)]) -> AuthResponse:
    try:
        token = await authenticate_user(
            session = session,
            email = payload.email,
            password = payload.password
        )
        return AuthResponse(access_token=token)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(error)
        ) from error


@router.get("/me")
async def me(subject: str = Depends(get_subject)) -> dict[str, str]:
    return {"user_id": subject}


@router.post("/refresh", response_model=AuthResponse)
async def refresh(payload: RefreshRequest, session: AsyncSession = Depends(get_db_session)) -> AuthResponse:
    try:
        refresh_token, replacement = await rotate_refresh_token(
            session = session,
            refresh_token = payload.refresh_token,
        )
        await session.commit()
        return AuthResponse(
            access_token=create_access_token(str(replacement.user_id)),
            refresh_token=refresh_token,
        )
    except RefreshTokenError as error:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(error)
        ) from error


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(payload: RefreshRequest, session: AsyncSession = Depends(get_db_session)) -> None:
    await revoke_refresh_token(session, payload.refresh_token)
    await session.commit()
