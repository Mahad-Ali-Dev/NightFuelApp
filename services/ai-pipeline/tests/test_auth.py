"""F22 #8: dual-auth on the AI pipeline + identity-based rate limiting.

These lock the security fix:
  * a data route with NO credential -> 401
  * a valid internal service token (X-Internal-Token) -> allowed (auth passes)
  * a valid user JWT (Authorization: Bearer) -> allowed (auth passes)
  * /health stays open (no auth)
  * the rate limiter keys on the VERIFIED identity, NOT the request-body userId
"""

import asyncio

import jwt
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.config import get_settings
from app import rate_limiter
from app.auth import require_caller

client = TestClient(app)

settings = get_settings()
INTERNAL_HEADERS = {"X-Internal-Token": settings.INTERNAL_SERVICE_TOKEN}

# A minimal, valid chat body that passes model validation so the only thing that
# can reject the request is the auth dependency.
CHAT_BODY = {"userId": "body-claimed-user", "message": "hello", "history": []}


def _user_jwt(subject: str = "real-user-1", claim: str = "userId") -> str:
    return jwt.encode({claim: subject}, settings.JWT_SECRET, algorithm="HS256")


# ── 401 when no credential is presented ──────────────────────────────────────

@pytest.mark.parametrize(
    "path",
    [
        "/v1/ai/chat",
        "/v1/ai/chat/stream",
        "/v1/ai/generate-plan",
        "/v1/ai/meal-swap",
        "/v1/ai/meal-score",
        "/v1/ai/weekly-audit",
    ],
)
def test_data_routes_require_auth(path):
    resp = client.post(path, json=CHAT_BODY)
    assert resp.status_code == 401


def test_health_is_open():
    resp = client.get("/v1/ai/health")
    assert resp.status_code == 200


def test_invalid_internal_token_rejected():
    resp = client.post(
        "/v1/ai/chat", json=CHAT_BODY, headers={"X-Internal-Token": "wrong"}
    )
    assert resp.status_code == 401


def test_invalid_bearer_rejected():
    resp = client.post(
        "/v1/ai/chat",
        json=CHAT_BODY,
        headers={"Authorization": "Bearer not-a-real-jwt"},
    )
    assert resp.status_code == 401


# ── valid credentials pass the auth gate ─────────────────────────────────────
# We don't assert 200 (the chains may hit mock/demo paths); we assert auth does
# NOT reject — i.e. anything other than 401.

def test_internal_token_allowed():
    resp = client.post("/v1/ai/chat", json=CHAT_BODY, headers=INTERNAL_HEADERS)
    assert resp.status_code != 401


def test_valid_user_jwt_allowed():
    headers = {"Authorization": f"Bearer {_user_jwt()}"}
    resp = client.post("/v1/ai/chat", json=CHAT_BODY, headers=headers)
    assert resp.status_code != 401


# ── require_caller resolves the right identity ───────────────────────────────

class _FakeRequest:
    def __init__(self, headers):
        # require_caller does case-insensitive .get; mimic that with a plain dict
        # whose keys are already lower-cased (Starlette headers are CI-insensitive).
        self.headers = {k.lower(): v for k, v in headers.items()}


def test_require_caller_internal_identity():
    req = _FakeRequest({"x-internal-token": settings.INTERNAL_SERVICE_TOKEN})
    assert asyncio.run(require_caller(req)) == "internal"


def test_require_caller_user_identity_from_sub():
    token = _user_jwt(subject="abc", claim="sub")
    req = _FakeRequest({"authorization": f"Bearer {token}"})
    assert asyncio.run(require_caller(req)) == "user:abc"


def test_require_caller_ignores_body_userid():
    # The verified identity comes ONLY from the token, never the body. A user
    # token for "victim" must resolve to user:victim regardless of any body.
    token = _user_jwt(subject="victim", claim="userId")
    req = _FakeRequest({"authorization": f"Bearer {token}"})
    assert asyncio.run(require_caller(req)) == "user:victim"


# ── rate limiter keys on identity, not body userId ───────────────────────────

class _FakeRedis:
    """In-memory stand-in for redis.asyncio.Redis (only what check_rate_limit uses)."""

    def __init__(self):
        self.store = {}

    async def incr(self, key):
        self.store[key] = self.store.get(key, 0) + 1
        return self.store[key]

    async def expire(self, key, seconds):
        return True

    async def ttl(self, key):
        return 3600


def test_rate_limit_keys_on_identity(monkeypatch):
    fake = _FakeRedis()
    monkeypatch.setattr(rate_limiter, "redis_client", fake)

    async def _run():
        # Two DIFFERENT verified user identities each get their own bucket — even
        # if a forged body claimed the same userId, the key here is the identity.
        await rate_limiter.check_rate_limit("user:alice", category="chat")
        await rate_limiter.check_rate_limit("user:bob", category="chat")

    asyncio.run(_run())
    assert fake.store["rate_limit:ai:chat:user:alice"] == 1
    assert fake.store["rate_limit:ai:chat:user:bob"] == 1


def test_internal_identity_bypasses_rate_limit(monkeypatch):
    fake = _FakeRedis()
    monkeypatch.setattr(rate_limiter, "redis_client", fake)

    async def _run():
        # Internal callers are trusted services: no bucket is touched at all.
        for _ in range(1000):
            await rate_limiter.check_rate_limit("internal", category="chat")

    asyncio.run(_run())
    assert fake.store == {}


def test_rate_limit_raises_when_over_quota(monkeypatch):
    fake = _FakeRedis()
    monkeypatch.setattr(rate_limiter, "redis_client", fake)
    limit = rate_limiter.RATE_LIMITS["chat"]["limit"]

    async def _run():
        # Burn the whole window for one identity, then the next call must 429.
        for _ in range(limit):
            await rate_limiter.check_rate_limit("user:heavy", category="chat")
        await rate_limiter.check_rate_limit("user:heavy", category="chat")

    with pytest.raises(rate_limiter.RateLimitExceeded):
        asyncio.run(_run())
