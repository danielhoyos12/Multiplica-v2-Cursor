# Backup & restore

## Scope

Primary data plane is **Convex**. Optional interim Postgres (non-Supabase) may still hold unmigrated pastoral modules — back up both when used.

## Convex

- Use Convex Dashboard backups / export for the deployment that backs staging and production.
- Document retention and restore owners offline (not in git secrets).
- Local anonymous Convex has no durable cloud backup — treat as disposable.

## Interim Postgres (if still used)

- Confirm PITR / daily backups on the host (e.g. Neon) before production use.
- Document retention for **staging** and **production** separately.
- Never point `DATABASE_URL` at `*.supabase.co` (runtime rejects it).

## Before critical operations

1. Snapshot or verify recent backup exists (Convex + interim DB if any).
2. Record `APP_ENV`, Convex deployment, migration version (if Postgres), and git SHA.
3. Prefer forward-compatible migrations; avoid destructive DDL without restore plan.

## Manual dump (interim Postgres only)

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
| Staging | Last Convex / DB backup | Hours |
| Production | Per Convex + DB plan | Defined by ops owner |

## What not to do

- Do not restore over shared shared-dev databases destructively during release drills if other work depends on them.
- Do not run verify fixture scripts against production (`prod-guard`).
