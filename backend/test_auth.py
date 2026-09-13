"""Weryfikacja JWT Supabase — HS256 z SUPABASE_JWT_SECRET."""
import os
import time
from uuid import uuid4

import jwt
import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_JWT_SECRET", "test-jwt-secret-for-drukstacja")
os.environ.setdefault("SUPABASE_JWT_AUDIENCE", "authenticated")

from auth import get_bearer_token, get_current_user, verify_supabase_jwt  # noqa: E402


def make_token(sub=None, *, secret=None, aud="authenticated", exp=None, **extra):
    payload = {
        "sub": sub or str(uuid4()),
        "aud": aud,
        "role": "authenticated",
        "exp": exp or int(time.time()) + 3600,
        **extra,
    }
    return jwt.encode(payload, secret or os.environ["SUPABASE_JWT_SECRET"], algorithm="HS256")


def test_verify_valid_hs256_token():
    user_id = str(uuid4())
    token = make_token(user_id, email="client@example.com")
    claims = verify_supabase_jwt(token)
    assert claims["sub"] == user_id
    assert claims["email"] == "client@example.com"


def test_expired_token_is_rejected():
    token = make_token(exp=int(time.time()) - 10)
    with pytest.raises(HTTPException) as exc:
        verify_supabase_jwt(token)
    assert exc.value.status_code == 401


def test_wrong_secret_is_rejected():
    token = make_token(secret="other-secret")
    with pytest.raises(HTTPException) as exc:
        verify_supabase_jwt(token)
    assert exc.value.status_code == 401


def test_get_current_user_reads_sub():
    user_id = str(uuid4())
    token = make_token(user_id)
    user = get_current_user(authorization=f"Bearer {token}")
    assert user.id == user_id


def test_missing_bearer_is_401():
    with pytest.raises(HTTPException) as exc:
        get_current_user(authorization=None)
    assert exc.value.status_code == 401
    assert get_bearer_token("Token abc") is None
    assert get_bearer_token("Bearer ") is None
    assert get_bearer_token("Bearer good") == "good"


def test_admin_user_matches_env_emails(monkeypatch):
    from auth import get_admin_user, get_current_user

    monkeypatch.setenv("ADMIN_EMAILS", "ops@drukstacja.pl, second@booorgi.pl")
    user_id = str(uuid4())
    token = make_token(user_id, email="second@booorgi.pl")
    admin = get_admin_user(user=get_current_user(authorization=f"Bearer {token}"))
    assert admin.id == user_id

    stranger = make_token(email="klient@example.com")
    with pytest.raises(HTTPException) as exc:
        get_admin_user(user=get_current_user(authorization=f"Bearer {stranger}"))
    assert exc.value.status_code == 403


def test_admin_without_config_is_503(monkeypatch):
    from auth import get_admin_user, get_current_user

    monkeypatch.delenv("ADMIN_EMAILS", raising=False)
    token = make_token(email="ops@drukstacja.pl")
    with pytest.raises(HTTPException) as exc:
        get_admin_user(user=get_current_user(authorization=f"Bearer {token}"))
    assert exc.value.status_code == 503


def test_missing_jwt_config_is_503(monkeypatch):
    monkeypatch.delenv("SUPABASE_JWT_SECRET", raising=False)
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("NEXT_PUBLIC_SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_JWKS_URL", raising=False)
    token = jwt.encode(
        {"sub": str(uuid4()), "exp": int(time.time()) + 60},
        "unused",
        algorithm="HS256",
    )
    with pytest.raises(HTTPException) as exc:
        verify_supabase_jwt(token)
    assert exc.value.status_code == 503
