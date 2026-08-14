#!/usr/bin/env bash
set -euo pipefail

# Applies foundation + Phase 1 RLS using DATABASE_URL (psql required).
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
  exit 1
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT_DIR/src/db/rls/001_foundation_rls.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT_DIR/src/db/rls/002_phase1_ministry_rls.sql"
echo "RLS applied (foundation + phase 1)."
