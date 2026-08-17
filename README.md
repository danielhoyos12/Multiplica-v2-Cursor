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
npm run db:seed:convex
npm run dev
```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run convex:dev` | Local anonymous Convex backend |
| `npm run db:seed:convex` | Seed catálogos RBAC / redes / distritos en Convex |
| `npm run build` / `start` | Production build |
| `npm run lint` / `typecheck` / `test` | Quality |
| `npm run test:e2e` | Playwright (needs running app; `PLAYWRIGHT_SKIP=1` to skip) |
| `npm run verify:invariants` | Data integrity (dev/staging only) |
| `npm run verify:phase10` | Release security/health checks |
| `npm run verify:release` | Orchestrated quality + verifies |

## Docs

- [Architecture](docs/architecture.md)
- [Supabase removal](docs/supabase-removal.md) · [Clerk cutover](docs/clerk-auth-cutover.md)
- [Convex FULL_CUTOVER](docs/convex-full-cutover-plan.md)
- [Domain invariants](docs/domain-invariants.md)
- [Security](docs/security.md)
- [Operations](docs/operations-runbook.md)
- [CHANGELOG](CHANGELOG.md)

## Environments

`LOCAL` · `STAGING` · `PRODUCTION` — separate Clerk + Convex deployments and env vars. Fixture/verify scripts refuse production targets.
