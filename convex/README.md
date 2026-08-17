# Convex — MULTIPLICA

**Backend:** Convex (typed queries/mutations + realtime).  
**Auth:** Clerk JWTs via `convex/auth.config.ts` + `ConvexProviderWithClerk`.

Plan: [`docs/convex-full-cutover-plan.md`](../docs/convex-full-cutover-plan.md) · Removal: [`docs/supabase-removal.md`](../docs/supabase-removal.md)

## Local anonymous backend

```bash
npm run convex:dev   # http://127.0.0.1:3210
npm run dev
# smoke: http://localhost:3000/convex-dev
```

No Convex cloud account required for anonymous mode. For Clerk-authenticated Convex calls against a cloud deployment, set `CLERK_JWT_ISSUER_DOMAIN` on that deployment and create a Clerk JWT template named `convex`.

## Layout

| Path | Role |
| --- | --- |
| `auth.config.ts` | Clerk JWT issuer (`CLERK_JWT_ISSUER_DOMAIN`) |
| `schema.ts` | Foundation + pastoral tables |
| `health.ts` | Local connectivity smoke |
| `foundation.ts` | Catalog list stubs |
| `_generated/` | Committed Convex codegen |

## Dual-run reminder

Do not dual-write leadership closure or transfers. One writer per domain.
