# MULTIPLICA — Architecture (Phase 0)

## Stack

| Layer | Choice |
| --- | --- |
| Web app | Next.js (App Router) + TypeScript |
| UI | Tailwind CSS v4 + design tokens MULTIPLICA |
| Backend | Modular monolith (server actions / route handlers / domain modules) |
| Database | PostgreSQL (Supabase) |
| Auth | Supabase Auth |
| Authorization | Domain policies + Supabase RLS (deny-by-default) |
| ORM / migrations | Drizzle ORM + drizzle-kit |
| Deploy target | Vercel (web) + Supabase (DB/Auth) |

## Folder structure

```text
src/
  app/                  # App Router routes (auth, dashboard, health)
  components/           # Shared UI + shell
  modules/              # Domain modules (authorization, audit, placeholders…)
  db/
    schema/             # Drizzle schema
    migrations/         # Versioned SQL migrations
    seeds/              # Reproducible seeds
    rls/                # RLS SQL applied after schema migrations
  lib/                  # env, errors, utilities
  server/               # server-only auth/supabase helpers & actions
  types/
docs/
```

## Server / client strategy

- **Browser:** `@/server/supabase/client` with anon key only.
- **Server Components / Actions / Route Handlers:** `@/server/supabase/server` (cookie session).
- **Privileged ops:** `@/server/supabase/admin` (service role) — server-only, never imported by client components.
- **SQL access:** `@/db/client` via `DATABASE_URL` (Drizzle). Prefer domain services over direct table access from the UI.

## Authentication model

1. Users authenticate with Supabase Auth (email/password in Phase 0).
2. `users` application table maps `id` 1:1 to `auth.users.id` and optionally links `person_id`.
3. Middleware refreshes the session and protects `/dashboard`.
4. Login never grants pastoral permissions by itself — roles are assigned explicitly.

## RLS strategy

- RLS is **enabled + forced** on all foundation tables (`src/db/rls/001_foundation_rls.sql`).
- Catalogs (`districts`, `networks`, `ministries`, roles/permissions) allow authenticated `SELECT` where appropriate.
- `users` / `user_role_assignments`: own-row access only.
- `persons`, `person_organization_history`, `audit_logs`: **no authenticated policies** in Phase 0 → deny by default; mutations go through server services after domain authorization.
- Tree-scoped policies arrive with Leadership phases; do not weaken deny-by-default early.

## Drizzle / migrations

```bash
npm run db:generate   # generate SQL from schema
npm run db:migrate    # apply migrations (requires DATABASE_URL)
npm run db:seed       # networks, districts, roles/permissions
```

Apply `src/db/rls/001_foundation_rls.sql` after schema migrations (Supabase SQL editor or migration pipeline).

## Architecture decisions

1. Modular monolith; no microservices in MVP.
2. Stable UUIDs as primary keys; human codes are not PKs.
3. Separate identity, organization, authn, authz, audit from day one.
4. Leadership tree will start as adjacency list + recursive CTE (later phase).
5. Metrics remain derived; no manual KPI counters.
6. Sensitive operations are transactional and audited.
7. Do not invent the 12 Ministerios Generales names in seeds — Superadmin configures them.

## Environment variables

See `.env.example`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server only)
- `DATABASE_URL` (server only)
- `NEXT_PUBLIC_APP_URL`

## Local run

```bash
cp .env.example .env.local
# fill Supabase + DATABASE_URL values
npm install
npm run db:migrate
# apply src/db/rls/001_foundation_rls.sql
npm run db:seed
npm run dev
```

Useful checks:

```bash
npm run lint
npm run typecheck
npm test
npm run build
curl http://localhost:3000/api/health
```
