import base64
import hashlib
import hmac
import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from app.core.config import get_settings

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")


def _b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode()


def _unb64(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 120_000)
    return f"pbkdf2_sha256$120000${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, hashed_password: str) -> bool:
    try:
        algorithm, rounds, salt, expected = hashed_password.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), _unb64(salt), int(rounds))
        return hmac.compare_digest(_b64(digest), expected)
    except (ValueError, TypeError):
        return False


def create_access_token(subject: str, expires_minutes: int = 30) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": subject, "iat": int(now.timestamp()), "exp": int((now + timedelta(minutes=expires_minutes)).timestamp())}
    header = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    unsigned = f"{header}.{body}"
    signature = hmac.new(get_settings().jwt_secret.encode(), unsigned.encode(), hashlib.sha256).digest()
    return f"{unsigned}.{_b64(signature)}"


def get_subject(token: Annotated[str, Depends(oauth2_scheme)]) -> str:
    try:
        header, body, encoded_signature = token.split(".", 2)
        unsigned = f"{header}.{body}"
        expected_signature = hmac.new(get_settings().jwt_secret.encode(), unsigned.encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(_b64(expected_signature), encoded_signature):
            raise ValueError("signature")
        payload = json.loads(_unb64(body))
        if int(payload.get("exp", 0)) <= int(datetime.now(timezone.utc).timestamp()):
            raise ValueError("expired")
        subject = payload.get("sub")
    except (ValueError, TypeError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="无效的访问令牌") from error
    if not isinstance(subject, str) or not subject:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="访问令牌缺少用户标识")
    return subject
