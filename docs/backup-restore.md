# Backup & restore

## Scope

Applies to Supabase Postgres used by MULTIPLICA. Do not promise capabilities beyond the current Supabase plan.

## Supabase backups

- Confirm PITR / daily backups available on the project plan before production.
- Document the actual retention window from the Supabase dashboard for **staging** and **production** projects separately.
- `multiplica-dev` is development only — not a production backup source of truth.

## Before critical operations

1. Snapshot or verify recent backup exists.
2. Record `APP_ENV`, project ref, migration version, and git SHA.
3. Prefer forward-compatible migrations; avoid destructive DDL without restore plan.

## Manual dump (dev/staging)

```bash
# Password redacted in logs — do not paste full DATABASE_URL into tickets
pg_dump "$DATABASE_URL" --format=custom --file=multiplica-staging.dump
```

Restore only into a **temporary** or staging database:

```bash
pg_restore --clean --if-exists -d "$STAGING_DATABASE_URL" multiplica-staging.dump
```

Then run `CRITICAL_FAIL=1 npm run verify:invariants` (never against production from fixture scripts).

## RPO / RTO (expected, not SLA)

| Env | RPO (data loss tolerance) | RTO (restore target) |
| --- | --- | --- |
| Staging | Last backup / dump | Hours |
| Production | Per Supabase plan PITR | Defined by ops owner |

## What not to do

- Do not restore over `multiplica-dev` destructively during Phase 10 drills if other work depends on it.
- Do not run verify fixture scripts against production (`prod-guard`).
