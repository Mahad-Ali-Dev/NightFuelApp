"""
Single source of truth for LLM model IDs.

All chains import from here so the model strings stay consistent and are
configurable per-environment without code changes. Defaults are the current
Anthropic/OpenAI model IDs as of this writing; override via env vars when
Anthropic ships a newer snapshot.
"""
import os

# Quality model — long-form reasoning (weekly audit). Default: Claude Sonnet 4.6.
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6")

# Fast model — latency/cost-sensitive paths (plan generation, coach chat,
# meal scoring/swap). Default: Claude Haiku 4.5.
ANTHROPIC_MODEL_FAST = os.environ.get("ANTHROPIC_MODEL_FAST", "claude-haiku-4-5-20251001")

# OpenAI fallbacks (used when provider == OPENAI).
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o")
OPENAI_MODEL_FAST = os.environ.get("OPENAI_MODEL_FAST", "gpt-4o-mini")
