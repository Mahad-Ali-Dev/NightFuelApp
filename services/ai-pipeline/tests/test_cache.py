"""Tests for the bounded in-memory LLM cache fallback (MEDIUM #11).

These verify that the in-memory fallback cannot grow unboundedly: it evicts the
oldest entries once the entry cap is reached (LRU) and expires entries after the
configured TTL, while preserving ordinary hit/miss semantics.
"""

import pytest

from app.cache import BoundedInMemoryCache


def _val(text):
    """Lightweight stand-in for a list[Generation] return value."""
    return [text]


def test_hit_and_miss():
    cache = BoundedInMemoryCache(max_entries=10, ttl_seconds=100)
    assert cache.lookup("p", "llm") is None  # miss
    cache.update("p", "llm", _val("answer"))
    assert cache.lookup("p", "llm") == _val("answer")  # hit
    assert cache.lookup("other", "llm") is None  # different key -> miss


def test_eviction_at_cap_lru():
    cache = BoundedInMemoryCache(max_entries=3, ttl_seconds=100)
    for i in range(3):
        cache.update(f"p{i}", "llm", _val(i))
    # Touch p0 so it becomes most-recently-used; p1 is now the oldest.
    assert cache.lookup("p0", "llm") == _val(0)
    # Insert a 4th entry -> exceeds cap -> oldest (p1) evicted.
    cache.update("p3", "llm", _val(3))

    assert cache._cache.__len__() == 3
    assert cache.lookup("p1", "llm") is None  # evicted
    assert cache.lookup("p0", "llm") == _val(0)  # survived (recently used)
    assert cache.lookup("p2", "llm") == _val(2)
    assert cache.lookup("p3", "llm") == _val(3)


def test_never_exceeds_cap_under_load():
    cache = BoundedInMemoryCache(max_entries=50, ttl_seconds=100)
    for i in range(5000):
        cache.update(f"prompt-{i}", "llm", _val(i))
        assert len(cache._cache) <= 50  # bounded at every step


def test_ttl_expiry(monkeypatch):
    fake = {"now": 1000.0}
    monkeypatch.setattr("app.cache.time.monotonic", lambda: fake["now"])

    cache = BoundedInMemoryCache(max_entries=10, ttl_seconds=30)
    cache.update("p", "llm", _val("answer"))
    assert cache.lookup("p", "llm") == _val("answer")  # fresh -> hit

    fake["now"] += 31  # advance past TTL
    assert cache.lookup("p", "llm") is None  # expired -> miss
    assert ("p", "llm") not in cache._cache  # and purged on lookup


def test_invalid_construction():
    with pytest.raises(ValueError):
        BoundedInMemoryCache(max_entries=0, ttl_seconds=10)
    with pytest.raises(ValueError):
        BoundedInMemoryCache(max_entries=10, ttl_seconds=0)
