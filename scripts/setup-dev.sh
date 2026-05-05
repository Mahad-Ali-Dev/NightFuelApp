#!/bin/bash
# NightFuel dev setup — robust npm install with retries.
#
# This script exists because the user's machine has had repeated npm
# install thrashes (resolution loops, partial installs, ENOTEMPTY
# errors). It does the install in a way that recovers from most of those.
#
# Usage:  bash scripts/setup-dev.sh         (full monorepo install)
#         bash scripts/setup-dev.sh mobile  (only clients/mobile)
#
# Read PRODUCTION_READINESS.md for context on the npm install flakiness.

set -e

target=${1:-all}

echo "→ NightFuel dev setup"
echo "  target:    $target"
echo "  node:      $(node --version 2>/dev/null || echo 'NOT INSTALLED')"
echo "  npm:       $(npm --version 2>/dev/null || echo 'NOT INSTALLED')"
echo ""

# ── Pre-flight checks ────────────────────────────────────────────────

if ! command -v node > /dev/null 2>&1; then
  echo "❌ node is not installed. Install Node 22 LTS from https://nodejs.org/"
  exit 1
fi

NODE_MAJOR=$(node --version | sed 's/v\([0-9]*\).*/\1/')
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "❌ node $NODE_MAJOR is too old. NightFuel needs Node 22 LTS."
  exit 1
fi

# ── Encoding sanity check (.npmrc) ───────────────────────────────────
# PowerShell on Windows defaults to UTF-16 LE for `Out-File`, which npm
# can't parse — silently ignoring legacy-peer-deps and breaking installs.
# We had to fix this once already; this check prevents regression.

for npmrc in .npmrc clients/mobile/.npmrc; do
  if [ -f "$npmrc" ]; then
    first2=$(head -c 2 "$npmrc" | od -An -tx1 | tr -d ' \n')
    if [ "$first2" = "fffe" ] || [ "$first2" = "feff" ]; then
      echo "⚠️  $npmrc is UTF-16 encoded — npm can't parse it."
      echo "    Fixing..."
      tmp=$(mktemp)
      iconv -f UTF-16LE -t UTF-8 "$npmrc" | sed 's/^\xef\xbb\xbf//; s/\r$//' > "$tmp"
      mv "$tmp" "$npmrc"
    fi
  fi
done

# ── Install ──────────────────────────────────────────────────────────

run_npm_install() {
  local cwd="$1"
  echo "→ Installing in $cwd ..."
  pushd "$cwd" > /dev/null

  # Clear half-completed state if present. ENOTEMPTY errors usually mean
  # an interrupted previous install left empty package dirs.
  if [ -d node_modules ] && [ ! -f node_modules/.package-lock.json ]; then
    echo "  Cleaning incomplete node_modules…"
    rm -rf node_modules
  fi

  # Install with retries. The flakiness we've seen is usually network-
  # related (registry timeouts), so a fresh attempt usually wins.
  local attempt=1
  local max_attempts=3
  while [ $attempt -le $max_attempts ]; do
    echo "  attempt $attempt/$max_attempts"
    if npm install --legacy-peer-deps --no-audit --no-fund --no-progress; then
      echo "  ✅ install complete"
      popd > /dev/null
      return 0
    fi
    echo "  ⚠️  attempt $attempt failed"
    if [ $attempt -lt $max_attempts ]; then
      echo "  Cleaning + retrying in 5s…"
      rm -rf node_modules package-lock.json
      sleep 5
    fi
    attempt=$((attempt + 1))
  done

  popd > /dev/null
  echo "❌ npm install failed after $max_attempts attempts in $cwd"
  return 1
}

case "$target" in
  all)
    run_npm_install "."
    echo ""
    echo "→ Verifying mobile workspace…"
    if [ -d clients/mobile/node_modules ]; then
      echo "  ✅ clients/mobile node_modules linked via workspace"
    else
      echo "  ⚠️  clients/mobile/node_modules missing — falling back to direct install"
      run_npm_install "clients/mobile"
    fi
    ;;
  mobile)
    run_npm_install "clients/mobile"
    ;;
  web)
    run_npm_install "clients/web"
    ;;
  *)
    echo "Unknown target: $target"
    echo "Usage: bash scripts/setup-dev.sh [all|mobile|web]"
    exit 1
    ;;
esac

echo ""
echo "✅ dev setup complete"
echo ""
echo "Next steps:"
echo "  cd clients/mobile && npx expo start    # mobile dev server"
echo "  npm run dev                            # full monorepo (turbo)"
