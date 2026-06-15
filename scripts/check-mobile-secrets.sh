#!/bin/bash
# NightFuel — guard against bundled mobile secrets.
#
# Anything exposed to the Expo client ships as PLAINTEXT inside the app bundle:
#   - every EXPO_PUBLIC_* env var is inlined into the JS bundle at build time, and
#   - everything under app.json's `expo.extra` is embedded in the manifest.
# So an API key / secret placed there is trivially extractable from a shipped
# build. This script greps the mobile env + app.json for forbidden patterns and
# fails the build if any are found, so a real secret can never be bundled by
# accident.
#
# What's ALLOWED in clients/mobile/.env:
#   - EXPO_PUBLIC_NF_API_BASE_URL  (a public base URL, not a credential)
#   - EXPO_PUBLIC_APP_ENV          (a plain environment label)
# What's FORBIDDEN (this script catches it):
#   - EXPO_PUBLIC_*KEY / EXPO_PUBLIC_*SECRET   (any bundled "key"/"secret" var)
#   - sk_live… / pk_live…   (Stripe live keys)
#   - sk-ant…               (Anthropic API keys)
#   - AIza…                 (Google API keys)
#
# Usage:  bash scripts/check-mobile-secrets.sh
# Exit:   0 = clean, 1 = a forbidden value (or a malformed input) was found.
#
# CI: wire this into the root `security:scan` flow (it is additive and safe).
# It is intentionally tolerant of a missing .env so CI and fresh checkouts —
# where the gitignored clients/mobile/.env does not exist — still pass.

set -uo pipefail

# Resolve repo root from this script's location so it works from any CWD.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

ENV_FILE="$REPO_ROOT/clients/mobile/.env"
APP_JSON="$REPO_ROOT/clients/mobile/app.json"

# Forbidden patterns. Kept as an extended-regex alternation so a single grep
# pass covers env vars and raw provider key prefixes alike.
#   EXPO_PUBLIC_[A-Z_]*KEY / SECRET  → any bundled key/secret-named public var
#   sk_live / pk_live                → Stripe live secret/publishable keys
#   sk-ant                           → Anthropic API keys
#   AIza                             → Google API keys
FORBIDDEN='EXPO_PUBLIC_[A-Z_]*KEY|EXPO_PUBLIC_[A-Z_]*SECRET|sk_live|pk_live|sk-ant|AIza'

violations=0

echo "→ Checking for bundled mobile secrets"

# ── clients/mobile/.env ──────────────────────────────────────────────
if [ -f "$ENV_FILE" ]; then
  echo "  scanning clients/mobile/.env"
  # -n shows the offending line numbers; we only print matches on failure.
  if matches="$(grep -nE "$FORBIDDEN" "$ENV_FILE")"; then
    echo "❌ Forbidden secret pattern found in clients/mobile/.env:"
    echo "$matches" | sed 's/^/     /'
    violations=$((violations + 1))
  fi
else
  echo "  clients/mobile/.env not present — skipping (CI/fresh-checkout parity)"
fi

# ── clients/mobile/app.json (expo.extra) ─────────────────────────────
# Values under expo.extra are embedded in the manifest, so they get the same
# scrutiny. We only flag app.json when it actually declares an `extra` block —
# the rest of the manifest legitimately contains words like "package".
if [ -f "$APP_JSON" ]; then
  if grep -q '"extra"' "$APP_JSON"; then
    echo "  scanning clients/mobile/app.json (expo.extra present)"
    if matches="$(grep -nE "$FORBIDDEN" "$APP_JSON")"; then
      echo "❌ Forbidden secret pattern found in clients/mobile/app.json:"
      echo "$matches" | sed 's/^/     /'
      violations=$((violations + 1))
    fi
  else
    echo "  clients/mobile/app.json has no expo.extra block — nothing to scan"
  fi
else
  echo "  clients/mobile/app.json not present — skipping"
fi

# ── Result ───────────────────────────────────────────────────────────
if [ "$violations" -gt 0 ]; then
  echo ""
  echo "❌ Bundled-secret check FAILED."
  echo "   EXPO_PUBLIC_* vars and app.json 'extra' ship as plaintext in the app"
  echo "   bundle. Move any real key/secret server-side (or to EAS secrets) and"
  echo "   reference it from the backend, never from the mobile client."
  exit 1
fi

echo "✅ OK — no bundled mobile secrets detected."
exit 0
