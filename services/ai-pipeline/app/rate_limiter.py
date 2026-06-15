import os
from typing import Optional

from fastapi import Request
from redis.asyncio import Redis

from .config import get_settings
from .logger import logger

settings = get_settings()

# We initialize a single connection pool for the lifespan of the app.
redis_client = Redis.from_url(settings.REDIS_URL, decode_responses=True)


def _int_env(name: str, default: int) -> int:
    """Read an int from the environment, falling back to a default.

    Invalid / empty values fall back rather than crashing the service at
    import time — a malformed limit override must never take the API down.
    """
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw)
    except (TypeError, ValueError):
        logger.warning(
            f"Invalid int for env {name}={raw!r}; using default {default}."
        )
        return default


# ---------------------------------------------------------------------------
# Per-category limits (fixed-window). All overridable via env, with sensible
# free-tier defaults. Windows are in seconds (default 3600 = 1 hour).
#
#   chat        -> /chat, /chat/stream
#   generation  -> /generate-plan, /weekly-audit, /meal-swap, /meal-score
# ---------------------------------------------------------------------------
RATE_LIMITS = {
    "chat": {
        "limit": _int_env("RATE_LIMIT_CHAT_PER_WINDOW", 20),
        "window_seconds": _int_env("RATE_LIMIT_CHAT_WINDOW_SECONDS", 3600),
    },
    "generation": {
        "limit": _int_env("RATE_LIMIT_GENERATION_PER_WINDOW", 10),
        "window_seconds": _int_env("RATE_LIMIT_GENERATION_WINDOW_SECONDS", 3600),
    },
}


class RateLimitExceeded(Exception):
    """Raised when a caller exceeds their per-window quota.

    Carried up to a FastAPI exception handler (see app/main.py) which renders
    the exact JSON body {error, retryAfterSeconds} with HTTP 429.
    """

    def __init__(self, retry_after_seconds: int, category: str, limit: int):
        self.retry_after_seconds = max(int(retry_after_seconds), 1)
        self.category = category
        self.limit = limit
        super().__init__(
            f"Rate limit exceeded for category '{category}' ({limit}/window)."
        )


def _resolve_identity(user_id: Optional[str], request: Optional[Request]) -> str:
    """Key the bucket on the authenticated userId, else fall back to client IP.

    Falling back to IP means anonymous / unauthenticated traffic is still
    capped (so the cost guard can't be bypassed by omitting userId), while a
    completely unidentifiable caller gets a shared "unknown" bucket.
    """
    if user_id and str(user_id).strip():
        return f"user:{str(user_id).strip()}"

    if request is not None:
        # Honor X-Forwarded-For (left-most = original client) when behind the
        # nginx gateway, otherwise the direct socket peer.
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            client_ip = fwd.split(",")[0].strip()
            if client_ip:
                return f"ip:{client_ip}"
        if request.client and request.client.host:
            return f"ip:{request.client.host}"

    return "ip:unknown"


async def check_rate_limit(
    user_id: Optional[str],
    category: str = "generation",
    request: Optional[Request] = None,
) -> int:
    """Enforce a per-user (or per-IP) fixed-window quota for LLM endpoints.

    Args:
        user_id: Authenticated user id. If empty, we fall back to client IP.
        category: One of RATE_LIMITS keys ("chat" | "generation").
        request: The FastAPI request, used only for the IP fallback.

    Returns:
        The current request count within the window (for logging/metrics).

    Raises:
        RateLimitExceeded: when the caller is over quota. Translated to a
            429 + {error, retryAfterSeconds} body by the app exception handler.

    Fails OPEN: if Redis is unreachable we log and allow the request. A Redis
    hiccup must never block a paying user — the trade-off is that the cost
    guard is temporarily disabled, which is preferable to an outage.
    """
    cfg = RATE_LIMITS.get(category)
    if cfg is None:
        logger.warning(
            f"Unknown rate-limit category '{category}'; defaulting to 'generation'."
        )
        cfg = RATE_LIMITS["generation"]
        category = "generation"

    limit = cfg["limit"]
    window_seconds = cfg["window_seconds"]

    identity = _resolve_identity(user_id, request)
    key = f"rate_limit:ai:{category}:{identity}"

    try:
        # Atomic increment; first hit in the window arms the TTL.
        count = await redis_client.incr(key)
        if count == 1:
            await redis_client.expire(key, window_seconds)

        if count > limit:
            # Remaining TTL == seconds until the window resets.
            ttl = await redis_client.ttl(key)
            if ttl is None or ttl < 0:
                # Key exists without a TTL (lost EXPIRE); re-arm so it can't
                # get stuck permanently exhausted, and report the full window.
                await redis_client.expire(key, window_seconds)
                ttl = window_seconds
            logger.warning(
                f"Rate limit exceeded ({category}) for {identity}: "
                f"{count}/{limit}, retry in {ttl}s"
            )
            raise RateLimitExceeded(
                retry_after_seconds=ttl, category=category, limit=limit
            )

        logger.info(
            f"AI quota ({category}) for {identity}: {count}/{limit} used."
        )
        return count

    except RateLimitExceeded:
        raise
    except Exception as e:
        # Fail OPEN: never block a user because Redis hiccuped. We lose the
        # cost guard for the duration of the outage, but availability wins.
        logger.error(
            f"Redis rate limit check failed ({category}, {identity}): {e}. "
            f"Allowing request (fail-open)."
        )
        return 0
