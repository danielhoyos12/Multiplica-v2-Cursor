#!/usr/bin/env bash
set -euo pipefail

# Applies foundation RLS using DATABASE_URL (psql required).
# Usage: ./scripts/apply-rls.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SQL_FILE="$ROOT_DIR/src/db/rls/001_foundation_rls.sql"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required"
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql not found. Apply $SQL_FILE manually in the Supabase SQL editor."
  exit 1
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SQL_FILE"
echo "RLS applied."
