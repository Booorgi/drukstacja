"""
Weryfikacja JWT Supabase Auth.

Źródło tożsamości: claim `sub` z tokenu (user_id).
Nie ufamy polu user_id przesłanemu w ciele żądania.

Weryfikacja:
  1. HS256 + SUPABASE_JWT_SECRET (JWT Secret z ustawień projektu Supabase)
  2. JWKS (ES256/RS256) z SUPABASE_JWKS_URL albo {SUPABASE_URL}/auth/v1/.well-known/jwks.json
"""
import os
from dataclasses import dataclass

import jwt
from fastapi import Depends, Header, HTTPException


@dataclass
class AuthUser:
    id: str
    email: str | None = None
    claims: dict | None = None


def _jwt_audience() -> str:
    return os.getenv("SUPABASE_JWT_AUDIENCE", "authenticated")


def _jwks_url() -> str | None:
    explicit = os.getenv("SUPABASE_JWKS_URL")
    if explicit:
        return explicit.rstrip("/")
    supabase_url = (
        os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL") or ""
    ).rstrip("/")
    if supabase_url:
        return f"{supabase_url}/auth/v1/.well-known/jwks.json"
    return None


def get_bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return token.strip()


def verify_supabase_jwt(token: str) -> dict:
    """Dekoduje i weryfikuje JWT Supabase. Rzuca HTTPException 401/503."""
    if not token:
        raise HTTPException(status_code=401, detail="Brak tokenu sesji.")

    audience = _jwt_audience()
    secret = os.getenv("SUPABASE_JWT_SECRET")
    last_error = None

    if secret:
        try:
            return jwt.decode(
                token,
                secret,
                algorithms=["HS256"],
                audience=audience,
                options={"require": ["exp", "sub"]},
            )
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Sesja wygasła. Zaloguj się ponownie.")
        except jwt.InvalidAudienceError:
            try:
                return jwt.decode(
                    token,
                    secret,
                    algorithms=["HS256"],
                    options={"require": ["exp", "sub"], "verify_aud": False},
                )
            except jwt.ExpiredSignatureError:
                raise HTTPException(status_code=401, detail="Sesja wygasła. Zaloguj się ponownie.")
            except Exception as err:
                last_error = err
        except jwt.InvalidTokenError as err:
            last_error = err

    jwks_url = _jwks_url()
    if jwks_url:
        try:
            jwks_client = jwt.PyJWKClient(jwks_url, cache_keys=True)
            signing_key = jwks_client.get_signing_key_from_jwt(token)
            return jwt.decode(
                token,
                signing_key.key,
                algorithms=["ES256", "RS256", "HS256"],
                audience=audience,
                options={"require": ["exp", "sub"]},
            )
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Sesja wygasła. Zaloguj się ponownie.")
        except Exception as err:
            last_error = err

    if last_error is not None:
        raise HTTPException(status_code=401, detail="Nieprawidłowy token sesji.")

    raise HTTPException(
        status_code=503,
        detail="Brak konfiguracji JWT (SUPABASE_JWT_SECRET albo SUPABASE_URL / SUPABASE_JWKS_URL).",
    )


def get_current_user(authorization: str | None = Header(default=None)) -> AuthUser:
    token = get_bearer_token(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Wymagane zalogowanie.")
    claims = verify_supabase_jwt(token)
    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token nie zawiera identyfikatora użytkownika.")
    return AuthUser(id=str(user_id), email=claims.get("email"), claims=claims)


def get_optional_user(authorization: str | None = Header(default=None)) -> AuthUser | None:
    token = get_bearer_token(authorization)
    if not token:
        return None
    return get_current_user(authorization)


def admin_emails() -> set[str]:
    raw = os.getenv("ADMIN_EMAILS") or ""
    return {part.strip().lower() for part in raw.split(",") if part.strip()}


def user_email(user: AuthUser) -> str | None:
    if user.email:
        return str(user.email)
    claims = user.claims or {}
    email = claims.get("email")
    if email:
        return str(email)
    meta = claims.get("user_metadata") or {}
    if isinstance(meta, dict) and meta.get("email"):
        return str(meta["email"])
    return None


def get_admin_user(user: AuthUser = Depends(get_current_user)) -> AuthUser:
    """Staff-only: e-mail z JWT musi być na liście ADMIN_EMAILS (po przecinku)."""
    allowed = admin_emails()
    if not allowed:
        raise HTTPException(status_code=503, detail="Brak konfiguracji ADMIN_EMAILS.")
    email = user_email(user)
    if not email or email.strip().lower() not in allowed:
        raise HTTPException(status_code=403, detail="Brak uprawnień administratora.")
    return user
