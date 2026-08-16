# MULTIPLICA — Supabase removal

| Campo | Valor |
| --- | --- |
| Fecha | 2026-08-16 |
| Branch | `cursor/no-supabase-backend-a3cc` |
| Auth | **Clerk only** (Supabase Auth removed) |
| Data | **Convex** required (`NEXT_PUBLIC_CONVEX_URL`) |
| Supabase SDK | **Uninstalled** (`@supabase/ssr`, `@supabase/supabase-js`) |
| Supabase Postgres hosts | **Rejected** at runtime (`*.supabase.co`) |

---

## What was removed

- Supabase Auth clients (`src/server/supabase/*`)
- Env: `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`
- npm packages `@supabase/ssr`, `@supabase/supabase-js`
- Verify/provision scripts no longer call Supabase Auth / PostgREST anon

## What replaces it

| Concern | Replacement |
| --- | --- |
| Login / session / passwords | Clerk |
| Realtime + typed backend | Convex |
| App user link | `users.clerk_user_id` |
| Health / ready | Clerk + Convex reachability |

## Interim Postgres

Legacy Drizzle modules may still call `getDb()` **only** if `DATABASE_URL` points at a **non-Supabase** host (e.g. Neon). Any `*.supabase.co` URL throws at runtime.

Prefer migrating those modules to Convex (`docs/convex-full-cutover-plan.md`).

## Operator checklist

1. `npm run convex:dev` (or cloud Convex deploy)
2. Clerk keys configured
3. Remove Supabase project usage; do not set Supabase DATABASE_URL
4. `npm run db:migrate` only if using interim non-Supabase Postgres for unmigrated modules

**STATUS: SUPABASE PRODUCT REMOVED — CONVEX + CLERK**
