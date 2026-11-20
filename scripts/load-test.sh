#!/usr/bin/env bash
# Runs the k6 load tests (in the official k6 container, nothing to install).
#
#   scripts/load-test.sh [browse|api|storm|all]  [base-url]
#   scripts/load-test.sh all http://localhost:3100          # against a local production server
#   scripts/load-test.sh all https://staging.example.com    # against staging
#
# NEVER point this at production: it registers accounts and generates sustained load.
# Results from a laptop only prove there is no pathological slowness; capacity planning needs staging that
# matches production (same hosting plan, a real database, real Shopify data).
set -euo pipefail

WHAT="${1:-all}"
BASE_URL="${2:-http://localhost:3100}"
K6_IMAGE="grafana/k6:1.4.0"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/loadtest"

run() {
  echo "=== k6: $1 against ${BASE_URL}"
  docker run --rm --network host -v "${DIR}:/loadtest:ro" -e BASE_URL="${BASE_URL}" "${K6_IMAGE}" run --quiet "/loadtest/$1.js"
}

case "${WHAT}" in
  browse | api | storm) run "${WHAT}" ;;
  all)
    # Run every scenario even if one fails, then report overall failure.
    status=0
    run browse || status=$?
    run api || status=$?
    run storm || status=$?
    exit "${status}"
    ;;
  *) echo "usage: $0 [browse|api|storm|all] [base-url]" >&2; exit 2 ;;
esac
