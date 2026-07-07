"""Pytest bootstrap for the AI pipeline tests.

`app.config.Settings` requires JWT_SECRET / INTERNAL_SERVICE_TOKEN (F22 #8) and
REDIS_URL at import time, and `app.main` constructs the settings on import.
Set safe test values BEFORE any test module imports `app.*` so the suite can
run without a real environment. CI also exports these (see .github/workflows),
these defaults just make `pytest` work locally too.
"""

import os

os.environ.setdefault("REDIS_URL", "redis://localhost:6379")
os.environ.setdefault("ANTHROPIC_API_KEY", "mock-key")
os.environ.setdefault("OPENAI_API_KEY", "mock-key")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-at-least-32-characters-long")
os.environ.setdefault("INTERNAL_SERVICE_TOKEN", "test-internal-token")
