#!/usr/bin/env bash
# Starts the built image next to a throwaway MongoDB and checks that it really works: runs unprivileged, passes its
# own health check, serves pages, and can create an account (argon2 native module + database).
#
#   scripts/docker-smoke.sh [image]     # default image: fernwood:local
#
# Uses random secrets and removes everything it started, even when a check fails.
set -euo pipefail

IMAGE="${1:-fernwood:local}"
PORT="${SMOKE_PORT:-3300}"
NET="fw-smoke-$$"
SECRET() { head -c 60 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c "$1"; }
CRON_SECRET="$(SECRET 40)"
BASE="http://127.0.0.1:${PORT}"
ORIGIN="http://localhost:${PORT}"

cleanup() { docker rm -f "${NET}-app" "${NET}-mongo" >/dev/null 2>&1 || true; docker network rm "${NET}" >/dev/null 2>&1 || true; }
trap cleanup EXIT

fail() { echo "FAIL: $1" >&2; echo "--- app log (tail) ---" >&2; docker logs --tail 40 "${NET}-app" >&2 || true; exit 1; }
ok() { echo "ok:   $1"; }

docker network create "${NET}" >/dev/null
docker run -d --name "${NET}-mongo" --network "${NET}" mongo:8 >/dev/null
docker run -d --name "${NET}-app" --network "${NET}" -p "127.0.0.1:${PORT}:3000" \
  -e MONGODB_URI="mongodb://${NET}-mongo:27017" -e MONGODB_DB_NAME=smoke \
  -e ACCESS_TOKEN_SECRET="$(SECRET 48)" -e REFRESH_TOKEN_SECRET="$(SECRET 48)" \
  -e ACCESS_TOKEN_EXPIRY=15m -e REFRESH_TOKEN_EXPIRY=7d -e SITE_URL="${ORIGIN}" -e CRON_SECRET="${CRON_SECRET}" \
  -e SMTP_EMAIL=shop@fernwood.test -e SMTP_PASS=smoke-test-not-real -e SMTP_HOST=127.0.0.1 -e SMTP_PORT=1 \
  "${IMAGE}" >/dev/null

for _ in $(seq 1 60); do curl -fsS "${BASE}/api/health" >/dev/null 2>&1 && break; sleep 2; done
curl -fsS "${BASE}/api/health" >/dev/null 2>&1 || fail "app did not start answering within 2 minutes"
ok "app is up"

[ "$(docker exec "${NET}-app" id -u)" != "0" ] || fail "container runs as root"
ok "runs as an unprivileged user (uid $(docker exec "${NET}-app" id -u))"

[ "$(curl -s "${BASE}/api/health")" = '{"data":{"status":"ok"}}' ] || fail "liveness response unexpected"
[ "$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/api/health/ready")" = "403" ] || fail "readiness must refuse anonymous callers"
curl -fsS -H "Authorization: Bearer ${CRON_SECRET}" "${BASE}/api/health/ready" | grep -q '"database":"ok"' || fail "readiness: database not ok"
ok "liveness and readiness (database reachable, anonymous readiness refused)"

for path in / /shop /products/monstera-deliciosa /images/hero-plants.jpg /robots.txt /sitemap.xml; do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "${BASE}${path}")" = "200" ] || fail "GET ${path} is not 200"
done
ok "pages, static assets, robots.txt and sitemap.xml serve"

curl -sI "${BASE}/" | grep -qi '^content-security-policy:' || fail "security headers missing"
ok "security headers present"

STATUS="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${BASE}/api/auth/register" \
  -H 'content-type: application/json' -H "origin: ${ORIGIN}" -H 'x-forwarded-for: 198.51.100.77' \
  -d '{"email":"smoke@example.com","password":"correct-horse-battery","firstName":"Smoke","lastName":"Test","acceptsMarketing":false}')"
[ "${STATUS}" = "201" ] || fail "account registration returned ${STATUS} (expected 201)"
ok "account registration works (argon2 + MongoDB)"

curl -fsS -H "Authorization: Bearer ${CRON_SECRET}" "${BASE}/api/cron/jobs" | grep -q '"data"' || fail "cron endpoint failed"
ok "background-job endpoint works"

for _ in $(seq 1 20); do
  [ "$(docker inspect --format '{{.State.Health.Status}}' "${NET}-app")" = "healthy" ] && break; sleep 3
done
[ "$(docker inspect --format '{{.State.Health.Status}}' "${NET}-app")" = "healthy" ] || fail "container never reported healthy"
ok "container reports healthy"

echo "All Docker smoke checks passed for ${IMAGE}"
