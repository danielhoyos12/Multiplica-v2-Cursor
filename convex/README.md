# Convex — MULTIPLICA

**Target backend:** Convex (typed queries/mutations + realtime).  
**Current live pastoral data:** still Supabase Postgres + Drizzle until each cutover phase.

Plan: [`docs/convex-full-cutover-plan.md`](../docs/convex-full-cutover-plan.md)

## Local anonymous backend

```bash
npm run convex:dev   # http://127.0.0.1:3210
npm run dev
# smoke: http://localhost:3000/convex-dev
```

No Convex cloud account required for anonymous mode.

## Layout

| Path | Role |
| --- | --- |
| `schema.ts` | Phase 0 foundation tables + `healthChecks` smoke |
| `health.ts` | Local connectivity smoke |
| `foundation.ts` | Catalog list stubs (empty until seed/phase 1) |
| `_generated/` | Committed Convex codegen |

## Dual-run reminder

Do not dual-write leadership closure or transfers. One writer per domain.
