# MULTIPLICA

Sistema de gestión integral de la Visión G12 — secuencia pastoral:

**GANAR → CONSOLIDAR (Pre / Encuentro / Post) → DISCIPULAR (CD1→CD2→Re-Encuentro→CD3→EM1–EM3) → ENVIAR**

Versión: **1.0.0-rc.1** (release candidate — no producción automática).

## Stack

| | |
| --- | --- |
| App | Next.js 16 (App Router) + React 19 + TypeScript |
| UI | Tailwind CSS v4 |
| DB | PostgreSQL (Supabase) + Drizzle ORM |
| Auth | Supabase Auth + RLS + domain authz |
| Deploy target | Vercel + Supabase (staging/prod separados) |

## Requirements

- Node.js **≥ 20** (see `.nvmrc`)
- npm
- Proyecto Supabase (URL, anon key, service role, `DATABASE_URL`)

## Quick start (local)

```bash
cp .env.example .env.local
# fill secrets — never commit .env.local
npm ci
npm run db:migrate
DATABASE_URL=… ./scripts/apply-rls.sh
npm run db:seed
npm run dev
```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `start` | Production build |
| `npm run lint` / `typecheck` / `test` | Quality |
| `npm run test:e2e` | Playwright (needs running app; `PLAYWRIGHT_SKIP=1` to skip) |
| `npm run db:migrate` / `db:seed` | Schema + catalogs |
| `npm run verify:invariants` | Data integrity (dev/staging only) |
| `npm run verify:phase10` | Release security/health checks |
| `npm run verify:release` | Orchestrated quality + verifies |

## Docs

- [Architecture](docs/architecture.md)
- [Domain invariants](docs/domain-invariants.md)
- [Security](docs/security.md) · [RLS matrix](docs/security-rls-matrix.md)
- [Operations](docs/operations-runbook.md)
- [Backup/restore](docs/backup-restore.md) · [Rollback](docs/deployment-rollback.md)
- [UAT](docs/uat-checklist.md) · [Go-live](docs/go-live-checklist.md)
- [Release readiness](docs/release-readiness.md)
- [Phase 10 cierre](docs/phase-10-cierre.md)
- [CHANGELOG](CHANGELOG.md)

## Environments

`LOCAL` · `STAGING` · `PRODUCTION` — separate Supabase projects and env vars. Never use `multiplica-dev` as production. Fixture/verify scripts refuse production targets.
