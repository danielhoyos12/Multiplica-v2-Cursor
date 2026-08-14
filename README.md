# Multiplica

Sistema de gestión integral de la Visión G12.

## Fase actual

**Fase 0 — Bootstrap / Foundation** (completa en código). Los módulos pastorales (Ganar, células, árbol, escuela, etc.) aún no están implementados.

## Stack

Next.js · TypeScript · App Router · Tailwind · PostgreSQL/Supabase · Supabase Auth · Drizzle ORM

## Quick start

```bash
cp .env.example .env.local
npm install
npm run db:migrate
# Apply src/db/rls/001_foundation_rls.sql in Supabase SQL editor
npm run db:seed
npm run dev
```

See [docs/architecture.md](docs/architecture.md) and [docs/domain-invariants.md](docs/domain-invariants.md).

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |
| `npm test` | Vitest |
| `npm run db:generate` | Generate Drizzle migrations |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Seed networks, districts, RBAC |
