# MULTIPLICA

Sistema de gestión integral de la Visión G12 — secuencia pastoral:

**GANAR → CONSOLIDAR (Pre / Encuentro / Post) → DISCIPULAR (CD1→CD2→Re-Encuentro→CD3→EM1–EM3) → ENVIAR**

Versión: **1.0.0-rc.1** (release candidate — no producción automática).

## Stack

| | |
| --- | --- |
| App | Next.js 16 (App Router) + React 19 + TypeScript |
| UI | Tailwind CSS v4 |
| Auth | **Clerk** |
| Backend / DB | **Convex** (typed queries/mutations + realtime) |
| Deploy target | Vercel + Clerk + Convex (staging/prod separados) |

Interim: some pastoral modules may still use Drizzle against a **non-Supabase** Postgres host while migrating — see [`docs/supabase-removal.md`](docs/supabase-removal.md).

## Requirements

- Node.js **≥ 20** (see `.nvmrc`)
- npm
- Clerk app keys (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`)
- Convex (`NEXT_PUBLIC_CONVEX_URL`; local: `npm run convex:dev`)
- Clerk JWT template named `convex` + `CLERK_JWT_ISSUER_DOMAIN` on the Convex deployment

## Quick start (local)

```bash
cp .env.example .env.local
# fill Clerk + Convex secrets — never commit .env.local
npm ci
npm run convex:dev   # separate terminal
npm run dev
```

Optional (interim Postgres only, never `*.supabase.co`):

```bash
npm run db:migrate
DATABASE_URL=… ./scripts/apply-rls.sh
npm run db:seed
```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run convex:dev` | Local anonymous Convex backend |
| `npm run build` / `start` | Production build |
| `npm run lint` / `typecheck` / `test` | Quality |
| `npm run test:e2e` | Playwright (needs running app; `PLAYWRIGHT_SKIP=1` to skip) |
| `npm run db:migrate` / `db:seed` | Interim Postgres schema + catalogs |
| `npm run verify:invariants` | Data integrity (dev/staging only) |
| `npm run verify:phase10` | Release security/health checks |
| `npm run verify:release` | Orchestrated quality + verifies |

## Docs

- [Architecture](docs/architecture.md)
- [Supabase removal](docs/supabase-removal.md) · [Clerk cutover](docs/clerk-auth-cutover.md)
- [Domain invariants](docs/domain-invariants.md)
- [Security](docs/security.md)
- [Operations](docs/operations-runbook.md)
- [Backup/restore](docs/backup-restore.md) · [Rollback](docs/deployment-rollback.md)
- [UAT](docs/uat-checklist.md) · [Go-live](docs/go-live-checklist.md)
- [Release readiness](docs/release-readiness.md)
- [CHANGELOG](CHANGELOG.md)

## Environments

`LOCAL` · `STAGING` · `PRODUCTION` — separate Clerk + Convex deployments and env vars. Never reuse a shared “dev only” project as production. Fixture/verify scripts refuse production targets.
