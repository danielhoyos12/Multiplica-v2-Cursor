#!/usr/bin/env bash
set -euo pipefail

# Applies foundation + Phase 1–8 RLS using DATABASE_URL (psql required).
# Policies use DROP POLICY IF EXISTS → CREATE POLICY (idempotent re-runs).
# Usage: ./scripts/apply-rls.sh
# Never run against production without explicit human approval.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required"
  exit 1
fi

APP_ENV_LOWER="$(echo "${APP_ENV:-}" | tr '[:upper:]' '[:lower:]')"
if [[ "$APP_ENV_LOWER" == "production" ]]; then
  echo "Refusing apply-rls.sh against APP_ENV=production"
  exit 1
fi

FILES=(
  "src/db/rls/001_foundation_rls.sql"
  "src/db/rls/002_phase1_ministry_rls.sql"
  "src/db/rls/003_phase2_ganar_rls.sql"
  "src/db/rls/004_phase3_cells_rls.sql"
  "src/db/rls/005_phase4_leadership_rls.sql"
  "src/db/rls/006_phase5_formation_rls.sql"
  "src/db/rls/007_phase6_destination_rls.sql"
  "src/db/rls/008_phase7_em_reencuentro_rls.sql"
  "src/db/rls/009_phase7_reconciliation_rls.sql"
  "src/db/rls/010_phase8_send_transfers_rls.sql"
)

if ! command -v psql >/dev/null 2>&1; then
  echo "psql not found. Install psql or apply these SQL files manually against interim (non-Supabase) Postgres:"
  for f in "${FILES[@]}"; do
    echo "  - $f"
  done
  exit 1
fi

for f in "${FILES[@]}"; do
  echo "Applying $f …"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT_DIR/$f"
done

echo "RLS applied (foundation + phases 1–8). Re-runs are safe (DROP IF EXISTS)."
