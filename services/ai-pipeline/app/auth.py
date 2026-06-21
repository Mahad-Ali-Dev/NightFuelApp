"""Authentication for the AI pipeline (F22 finding #8).

The ai-pipeline sits behind the public nginx gateway (the /v1/ai location is
NOT blocked because the mobile app calls /v1/ai/chat/stream directly). Before
this module the service had NO authentication: anyone on the internet could
POST a forged-body `userId` and drain the paid LLM, because the rate limiter
keyed on the request-body userId.

`require_caller` authorizes a request as EITHER:

  (a) a valid USER JWT in the `Authorization: Bearer <token>` header, verified
      with the shared HS256 JWT_SECRET (same secret the TS services mint with,
      payload claim `userId`). Identity -> "user:<sub|userId|id>".

  (b) a valid INTERNAL service token in the `X-Internal-Token` header, matched
      (constant-time) against INTERNAL_SERVICE_TOKEN. The four sibling services
      (chat/exercise/plan/progress) call ai-pipeline server-to-server with this
      header. Identity -> "internal".

On neither -> HTTP 401. The resolved identity string is returned and used by
the rate limiter as the trusted bucket key (NOT the body userId).
"""

import hmac
from typing import Optional

import jwt
from fastapi import HTTPException, Request, status

from .config import get_settings
from .logger import logger

settings = get_settings()

# Identity returned for a valid internal service token.
INTERNAL_IDENTITY = "internal"


def _identity_from_jwt(token: str) -> Optional[str]:
    """Verify an HS256 user JWT and derive a stable identity, else None.

    Accepts the first present of `sub` / `userId` / `id` as the subject — the
    TS auth-service mints `{ userId, role }`, but we stay tolerant of the
    standard `sub` claim too.
    """
    try:
        claims = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=["HS256"],
        )
    except jwt.PyJWTError as exc:
        logger.warning(f"Rejected user JWT: {exc}")
        return None

    subject = claims.get("sub") or claims.get("userId") or claims.get("id")
    if not subject:
        logger.warning("User JWT verified but carried no sub/userId/id claim.")
        return None
    return f"user:{subject}"


def _is_valid_internal_token(token: str) -> bool:
    """Constant-time compare against the configured internal service token."""
    expected = settings.INTERNAL_SERVICE_TOKEN
    if not expected or not token:
        return False
    return hmac.compare_digest(str(token), str(expected))


async def require_caller(request: Request) -> str:
    """FastAPI dependency: authorize the caller and return its identity.

    Returns one of:
        "internal"        -> trusted sibling service (X-Internal-Token).
        "user:<subject>"  -> authenticated end user (Bearer JWT).

    Raises HTTPException(401) when neither credential is valid. Applied to every
    data route (NOT /health). The returned identity is what the rate limiter
    keys on, so a forged body userId can no longer mint someone else's quota.
    """
    # (b) Internal service token — trusted server-to-server callers.
    internal_token = request.headers.get("x-internal-token")
    if internal_token and _is_valid_internal_token(internal_token):
        return INTERNAL_IDENTITY

    # (a) User JWT in Authorization: Bearer <token>.
    auth_header = request.headers.get("authorization") or ""
    if auth_header.lower().startswith("bearer "):
        token = auth_header[7:].strip()
        if token:
            identity = _identity_from_jwt(token)
            if identity is not None:
                return identity

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Unauthorized",
        headers={"WWW-Authenticate": "Bearer"},
    )
