"""
Semantic-cache initialisation for the Zeitra AI Pipeline.

Strategy (in order of preference):
  1. Redis SemanticCache  – deduplicates near-identical LLM calls across restarts.
  2. InMemoryCache        – session-scoped fallback (no external dependency).
  3. No-op               – service keeps working, just without caching.
"""
from __future__ import annotations

import time
from collections import OrderedDict
from typing import Any

from langchain_core.caches import BaseCache

from .config import get_settings
from .logger import logger

# Default bounds for the in-memory fallback cache. These cap memory growth so
# the process can run indefinitely without the cache leaking (MEDIUM #11).
_DEFAULT_MAX_ENTRIES = 1000
_DEFAULT_TTL_SECONDS = 60 * 60  # 1 hour


class BoundedInMemoryCache(BaseCache):
    """A bounded LRU + TTL in-memory LLM cache.

    LangChain's stock ``InMemoryCache`` is an unbounded ``dict`` that grows for
    the lifetime of the process. On the live in-memory fallback path that is an
    unbounded memory leak. This drop-in replacement caps the number of stored
    entries (LRU eviction of the oldest) and expires entries after a TTL, while
    preserving the same hit/miss semantics.
    """

    def __init__(
        self,
        max_entries: int = _DEFAULT_MAX_ENTRIES,
        ttl_seconds: float = _DEFAULT_TTL_SECONDS,
    ) -> None:
        if max_entries <= 0:
            raise ValueError("max_entries must be greater than 0")
        if ttl_seconds <= 0:
            raise ValueError("ttl_seconds must be greater than 0")
        self._max_entries = max_entries
        self._ttl_seconds = ttl_seconds
        # key -> (expiry_monotonic_ts, return_val); ordered by recency of use.
        self._cache: "OrderedDict[tuple[str, str], tuple[float, Any]]" = OrderedDict()

    def lookup(self, prompt: str, llm_string: str) -> Any | None:
        """Return the cached value, or ``None`` on miss/expiry."""
        key = (prompt, llm_string)
        entry = self._cache.get(key)
        if entry is None:
            return None
        expiry, return_val = entry
        if time.monotonic() >= expiry:
            # Expired — evict and report a miss.
            del self._cache[key]
            return None
        # Mark as most-recently-used.
        self._cache.move_to_end(key)
        return return_val

    def update(self, prompt: str, llm_string: str, return_val: Any) -> None:
        """Insert/overwrite an entry, evicting expired and oldest as needed."""
        key = (prompt, llm_string)
        self._cache[key] = (time.monotonic() + self._ttl_seconds, return_val)
        self._cache.move_to_end(key)
        self._evict()

    def clear(self, **kwargs: Any) -> None:
        """Empty the entire cache."""
        self._cache.clear()

    def _evict(self) -> None:
        """Drop expired entries first, then LRU-evict down to the cap."""
        now = time.monotonic()
        for key in [k for k, (exp, _) in self._cache.items() if now >= exp]:
            del self._cache[key]
        while len(self._cache) > self._max_entries:
            self._cache.popitem(last=False)


def init_semantic_cache() -> None:
    """
    Initialise LangChain's global LLM cache on application startup.

    The function is intentionally resilient: if the preferred Redis backend
    is unavailable (network issue, missing package, bad key) it falls back
    gracefully and never raises.
    """
    settings = get_settings()

    # ── Attempt 1: Redis-backed Semantic Cache ────────────────────────────
    # Requires langchain-community; not in base requirements so we guard.
    try:
        # Upstash Redis does not support 'MODULE' commands required by RedisSemanticCache.
        raise ImportError("Upstash Redis compatibility: MODULE command unsupported. Falling back to InMemoryCache.")
        from langchain_community.cache import RedisSemanticCache  # type: ignore
        from langchain_openai import OpenAIEmbeddings
        from langchain.globals import set_llm_cache

        embeddings = OpenAIEmbeddings(
            api_key=settings.OPENAI_API_KEY,
            model="text-embedding-3-small",
        )
        cache = RedisSemanticCache(
            redis_url=settings.REDIS_URL,
            embedding=embeddings,
            score_threshold=0.95,   # cosine similarity — only cache near-identical prompts
        )
        set_llm_cache(cache)
        logger.info("LLM cache: Redis semantic cache active (cross-session, near-duplicate dedup)")
        return

    except ImportError:
        logger.warning(
            "LLM cache: langchain-community not installed — "
            "Redis semantic cache unavailable. "
            "Install with: pip install langchain-community"
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            f"LLM cache: Redis semantic cache init failed ({exc!r}) — "
            "falling back to in-memory cache."
        )

    # ── Attempt 2: Bounded In-Memory Cache ────────────────────────────────
    # Session-scoped (resets on restart) but bounded: LRU + TTL so it cannot
    # grow without limit on the live fallback path (MEDIUM #11).
    try:
        cache = BoundedInMemoryCache(
            max_entries=_DEFAULT_MAX_ENTRIES,
            ttl_seconds=_DEFAULT_TTL_SECONDS,
        )
        # LangChain ≥ 0.1 exposes set_llm_cache in langchain.globals
        try:
            from langchain.globals import set_llm_cache  # type: ignore
        except ImportError:
            # Older LangChain (< 0.1) used module-level attribute
            import langchain

            langchain.llm_cache = cache  # type: ignore[attr-defined]
            logger.info(
                "LLM cache: bounded in-memory cache active "
                "(legacy API, LRU+TTL, max=%d, ttl=%ds)",
                _DEFAULT_MAX_ENTRIES,
                _DEFAULT_TTL_SECONDS,
            )
            return

        set_llm_cache(cache)
        logger.info(
            "LLM cache: bounded in-memory cache active "
            "(session-scoped, LRU+TTL, max=%d, ttl=%ds)",
            _DEFAULT_MAX_ENTRIES,
            _DEFAULT_TTL_SECONDS,
        )
        return

    except Exception as exc:  # noqa: BLE001
        logger.warning(
            f"LLM cache: bounded in-memory cache init also failed ({exc!r}) — "
            "running without LLM cache (higher API cost possible)."
        )
