from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    username: EmailStr
    password: str = Field(min_length=8)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
