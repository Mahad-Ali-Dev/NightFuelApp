#!/usr/bin/env bash
# ── Zeitra health watchdog ────────────────────────────────────────────────────
# Curls the public endpoints every run; on failure sends an alert email through
# the Resend API (key reused from the compose .env, where it already lives as
# SMTP_PASSWORD). Cooldown file per target stops alert spam (max 1/hour), and a
# recovery email fires when a target comes back.
#
# Install:
#   crontab -e
#   */5 * * * * /home/deploy/nightfuel/infra/ops/health-watchdog.sh >> /home/deploy/backups/watchdog.log 2>&1
#
# BLIND SPOT: this runs ON the VPS — if the whole box dies, the watchdog dies
# with it. Pair with a free external pinger (UptimeRobot) on the same URLs.
set -uo pipefail

ENV_FILE="${ENV_FILE:-/home/deploy/nightfuel/infra/docker/.env}"
STATE_DIR="${STATE_DIR:-/home/deploy/.watchdog}"
ALERT_TO="${ALERT_TO:-mahadali107600@gmail.com}"
ALERT_FROM="${ALERT_FROM:-no-reply@zeitra.app}"
COOLDOWN_SECS=3600

# Targets: "name|url|expected-substring"
TARGETS=(
    "api-gateway|https://api.zeitra.app/health|ok"
    "website|https://zeitra.app/|html"
)

mkdir -p "$STATE_DIR"

# Resend key doubles as the SMTP password in the compose env.
RESEND_KEY="$(grep -E '^SMTP_PASSWORD=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2-)"

send_mail() { # subject, body
    [ -n "$RESEND_KEY" ] || { echo "no RESEND key; cannot alert"; return 1; }
    curl -sS -m 15 -X POST https://api.resend.com/emails \
        -H "Authorization: Bearer $RESEND_KEY" \
        -H "Content-Type: application/json" \
        -d "$(printf '{"from":"Zeitra Watchdog <%s>","to":["%s"],"subject":"%s","text":"%s"}' \
              "$ALERT_FROM" "$ALERT_TO" "$1" "$2")" > /dev/null \
        && echo "  alert sent: $1"
}

for entry in "${TARGETS[@]}"; do
    name="${entry%%|*}"; rest="${entry#*|}"
    url="${rest%%|*}"; want="${rest#*|}"
    down_file="$STATE_DIR/$name.down"
    lastalert_file="$STATE_DIR/$name.lastalert"

    body="$(curl -sS -m 20 -o - -w '\n%{http_code}' "$url" 2>/dev/null || true)"
    code="$(printf '%s' "$body" | tail -1)"
    ok=0
    case "$code" in 2*|3*) printf '%s' "$body" | grep -qi "$want" && ok=1 ;; esac

    now="$(date +%s)"
    if [ "$ok" = "1" ]; then
        if [ -f "$down_file" ]; then
            downtime=$(( now - $(cat "$down_file") ))
            send_mail "✅ RECOVERED: $name is back" \
                "$name ($url) is healthy again after ~$(( downtime / 60 )) min down. $(date -Is)"
            rm -f "$down_file" "$lastalert_file"
        fi
        echo "[$(date -Is)] $name OK ($code)"
    else
        echo "[$(date -Is)] $name FAIL (http=$code)"
        [ -f "$down_file" ] || echo "$now" > "$down_file"
        last=0; [ -f "$lastalert_file" ] && last="$(cat "$lastalert_file")"
        if [ $(( now - last )) -ge "$COOLDOWN_SECS" ]; then
            send_mail "🔴 DOWN: $name failing" \
                "$name ($url) is failing (http=$code) as of $(date -Is). Checks run every 5 min; next reminder in 1h if still down."
            echo "$now" > "$lastalert_file"
        fi
    fi
done
