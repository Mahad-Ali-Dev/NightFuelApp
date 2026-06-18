"""
Semantic-cache initialisation for the Zeitra AI Pipeline.

Strategy (in order of preference):
  1. Redis SemanticCache  – deduplicates near-identical LLM calls across restarts.
  2. InMemoryCache        – session-scoped fallback (no external dependency).
  3. No-op               – service keeps working, just without caching.
"""
from __future__ import annotations

from .config import get_settings
from .logger import logger


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

    # ── Attempt 2: In-Memory Cache ────────────────────────────────────────
    # Ships with langchain core; resets on every process restart.
    try:
        # LangChain ≥ 0.1 exposes set_llm_cache in langchain.globals
        try:
            from langchain.globals import set_llm_cache  # type: ignore
            from langchain.cache import InMemoryCache     # type: ignore
        except ImportError:
            # Older LangChain (< 0.1) used module-level attribute
            import langchain
            from langchain.cache import InMemoryCache     # type: ignore

            langchain.llm_cache = InMemoryCache()         # type: ignore[attr-defined]
            logger.info("LLM cache: in-memory cache active (legacy API, session-scoped)")
            return

        set_llm_cache(InMemoryCache())
        logger.info("LLM cache: in-memory cache active (session-scoped, non-persistent)")
        return

    except Exception as exc:  # noqa: BLE001
        logger.warning(
            f"LLM cache: InMemoryCache init also failed ({exc!r}) — "
            "running without LLM cache (higher API cost possible)."
        )
