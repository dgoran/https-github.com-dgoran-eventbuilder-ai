#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PORT="${PORT:-8080}"
AI_RATE_LIMIT_MAX_REQUESTS="${AI_RATE_LIMIT_MAX_REQUESTS:-5}"
RUN_NODE_TESTS="${RUN_NODE_TESTS:-1}"
RUN_BUILD="${RUN_BUILD:-1}"

if [[ -z "${ENCRYPTION_KEY:-}" ]]; then
  echo "ERROR: ENCRYPTION_KEY is required (64 hex chars)."
  exit 1
fi

if [[ ! "$ENCRYPTION_KEY" =~ ^[0-9a-fA-F]{64}$ ]]; then
  echo "ERROR: ENCRYPTION_KEY must be exactly 64 hex chars."
  exit 1
fi

if [[ -z "${APP_API_TOKEN:-}" && -z "${JWT_SECRET:-}" && -z "${OIDC_JWKS_URL:-}" ]]; then
  echo "ERROR: set one auth mode: APP_API_TOKEN or JWT_SECRET or OIDC_JWKS_URL."
  exit 1
fi

# For curl smoke checks we need a concrete bearer token.
AUTH_TOKEN="${SMOKE_AUTH_TOKEN:-${APP_API_TOKEN:-}}"
if [[ -z "$AUTH_TOKEN" ]]; then
  echo "ERROR: SMOKE_AUTH_TOKEN is required for API smoke checks when APP_API_TOKEN is not set."
  exit 1
fi

echo "Starting server on :$PORT ..."
SERVER_LOG="${SERVER_LOG:-/tmp/eventbuilder-security-smoke.log}"

NODE_ENV=production \
PORT="$PORT" \
ENCRYPTION_KEY="$ENCRYPTION_KEY" \
APP_API_TOKEN="${APP_API_TOKEN:-}" \
JWT_SECRET="${JWT_SECRET:-}" \
JWT_ISSUER="${JWT_ISSUER:-}" \
JWT_AUDIENCE="${JWT_AUDIENCE:-}" \
OIDC_JWKS_URL="${OIDC_JWKS_URL:-}" \
OIDC_JWKS_CACHE_TTL_MS="${OIDC_JWKS_CACHE_TTL_MS:-}" \
AI_RATE_LIMIT_MAX_REQUESTS="$AI_RATE_LIMIT_MAX_REQUESTS" \
npm run server >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!

cleanup() {
  if ps -p "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "Waiting for /api/health ..."
for i in {1..40}; do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
  if [[ "$i" -eq 40 ]]; then
    echo "ERROR: server did not become healthy. Log: $SERVER_LOG"
    exit 1
  fi
done

echo "Checking unauthenticated /api/admin/config (expect 401) ..."
UNAUTH_STATUS="$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/api/admin/config")"
if [[ "$UNAUTH_STATUS" != "401" ]]; then
  echo "ERROR: expected 401, got $UNAUTH_STATUS"
  exit 1
fi

echo "Checking authenticated /api/admin/config (expect 200) ..."
AUTH_STATUS="$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $AUTH_TOKEN" "http://127.0.0.1:$PORT/api/admin/config")"
if [[ "$AUTH_STATUS" != "200" ]]; then
  echo "ERROR: expected 200, got $AUTH_STATUS"
  exit 1
fi

echo "Checking AI rate limit (expect at least one 429) ..."
HIT_429=0
for i in $(seq 1 $((AI_RATE_LIMIT_MAX_REQUESTS + 3))); do
  CODE="$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{}' \
    "http://127.0.0.1:$PORT/api/ai/generate-event")"
  if [[ "$CODE" == "429" ]]; then
    HIT_429=1
    break
  fi
done
if [[ "$HIT_429" -ne 1 ]]; then
  echo "ERROR: did not observe 429 rate-limit response."
  exit 1
fi

if [[ "$RUN_NODE_TESTS" == "1" ]]; then
  echo "Running npm test ..."
  npm test
fi

if [[ "$RUN_BUILD" == "1" ]]; then
  echo "Running npm run build ..."
  npm run build
fi

echo "Security smoke checks passed."
