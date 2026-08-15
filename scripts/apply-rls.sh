#!/usr/bin/env bash
set -euo pipefail

# Applies foundation + Phase 1–4 RLS using DATABASE_URL (psql required).
# Usage: ./scripts/apply-rls.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required"
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql not found. Apply these files manually in the Supabase SQL editor:"
  echo "  - src/db/rls/001_foundation_rls.sql"
  echo "  - src/db/rls/002_phase1_ministry_rls.sql"
  echo "  - src/db/rls/003_phase2_ganar_rls.sql"
  echo "  - src/db/rls/004_phase3_cells_rls.sql"
  echo "  - src/db/rls/005_phase4_leadership_rls.sql"
  echo "  - src/db/rls/006_phase5_formation_rls.sql"
  echo "  - src/db/rls/007_phase6_destination_rls.sql"
  echo "  - src/db/rls/008_phase7_em_reencuentro_rls.sql"
  echo "  - src/db/rls/009_phase7_reconciliation_rls.sql"
  exit 1
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT_DIR/src/db/rls/001_foundation_rls.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT_DIR/src/db/rls/002_phase1_ministry_rls.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT_DIR/src/db/rls/003_phase2_ganar_rls.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT_DIR/src/db/rls/004_phase3_cells_rls.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT_DIR/src/db/rls/005_phase4_leadership_rls.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT_DIR/src/db/rls/006_phase5_formation_rls.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT_DIR/src/db/rls/007_phase6_destination_rls.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT_DIR/src/db/rls/008_phase7_em_reencuentro_rls.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT_DIR/src/db/rls/009_phase7_reconciliation_rls.sql"
echo "RLS applied (foundation + phases 1–7 + reconciliation)."
