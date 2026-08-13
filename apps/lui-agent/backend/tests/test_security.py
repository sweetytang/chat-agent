from fastapi import HTTPException

from app.core.security import (
    create_access_token,
    get_optional_subject,
    get_subject,
    hash_password,
    verify_password,
)


def test_password_hash_is_not_plaintext_and_verifies() -> None:
    hashed = hash_password("correct horse battery staple")

    assert hashed != "correct horse battery staple"
    assert verify_password("correct horse battery staple", hashed) is True
    assert verify_password("wrong", hashed) is False


def test_jwt_subject_round_trip() -> None:
    token = create_access_token("user-1")

    assert get_subject(token) == "user-1"


def test_tampered_jwt_is_rejected() -> None:
    token = create_access_token("user-1")
    header, payload, signature = token.split(".")
    replacement = "A" if signature[0] != "A" else "B"
    tampered = f"{header}.{payload}.{replacement}{signature[1:]}"

    try:
        get_subject(tampered)
    except HTTPException as error:
        assert error.status_code == 401
    else:
        raise AssertionError("tampered token should be rejected")


def test_optional_subject_allows_missing_token_but_rejects_invalid_token() -> None:
    assert get_optional_subject(None) is None

    try:
        get_optional_subject("invalid")
    except HTTPException as error:
        assert error.status_code == 401
    else:
        raise AssertionError("invalid optional token should be rejected")
