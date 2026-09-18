from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, current_user
from app.db.models import User
from app.db.session import get_db_session
from app.modules.auth.refresh_tokens import (
    RefreshTokenError,
    create_refresh_token,
    revoke_refresh_token,
    rotate_refresh_token,
)
from app.modules.auth.service import authenticate_user, register_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    email: str
    password: str = Field(min_length=8)
    name: str | None = Field(default=None, max_length=100)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        value = value.strip().lower()
        if "@" not in value or value.startswith("@") or value.endswith("@"):
            raise ValueError("请输入有效邮箱")
        return value


class UpdateProfileRequest(BaseModel):
    name: str = Field(max_length=100)


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    refresh_token: str


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=20)


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegisterRequest, session: Annotated[AsyncSession, Depends(get_db_session)]
) -> AuthResponse:
    try:
        user = await register_user(session, payload.email, payload.password, name=payload.name)
        refresh_token, _ = await create_refresh_token(session, user.id)
        await session.commit()
        return AuthResponse(
            access_token=create_access_token(str(user.id)), refresh_token=refresh_token
        )
    except Exception as error:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error


class LoginRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return value.strip().lower()


@router.post("/token", response_model=AuthResponse)
async def login(
    payload: LoginRequest, session: Annotated[AsyncSession, Depends(get_db_session)]
) -> AuthResponse:
    try:
        user = await authenticate_user(
            session=session, email=payload.email, password=payload.password
        )
        refresh_token, _ = await create_refresh_token(session, user.id)
        await session.commit()
        return AuthResponse(
            access_token=create_access_token(str(user.id)), refresh_token=refresh_token
        )
    except ValueError as error:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(error)) from error


@router.get("/me")
async def me(
    user: User = Depends(current_user),
) -> dict[str, Any]:
    return {
        "user_id": str(user.id),
        "email": user.email,
        "name": user.name,
        "role": user.role.value if hasattr(user.role, "value") else str(user.role),
    }


@router.patch("/me")
async def update_profile(
    payload: UpdateProfileRequest,
    user: User = Depends(current_user),
) -> dict[str, Any]:
    if payload.name is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="姓名不能传空值")
    name = payload.name.strip()
    return {
        "user_id": str(user.id),
        "email": user.email,
        "name": name,
        "role": user.role.value if hasattr(user.role, "value") else str(user.role),
    }


@router.post("/refresh", response_model=AuthResponse)
async def refresh(
    payload: RefreshRequest, session: AsyncSession = Depends(get_db_session)
) -> AuthResponse:
    try:
        refresh_token, replacement = await rotate_refresh_token(
            session=session,
            raw_token=payload.refresh_token,
        )
        await session.commit()
        return AuthResponse(
            access_token=create_access_token(str(replacement.user_id)),
            refresh_token=refresh_token,
        )
    except RefreshTokenError as error:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(error)) from error


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(payload: RefreshRequest, session: AsyncSession = Depends(get_db_session)) -> None:
    await revoke_refresh_token(session, payload.refresh_token)
    await session.commit()
