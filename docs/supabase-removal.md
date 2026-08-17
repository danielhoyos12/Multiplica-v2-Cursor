# MULTIPLICA — Supabase removal

| Campo | Valor |
| --- | --- |
| Fecha | 2026-08-16 |
| Branch | `cursor/no-supabase-backend-a3cc` |
| Auth | **Clerk only** |
| Data | **Convex** required (`NEXT_PUBLIC_CONVEX_URL`) |
| Supabase SDK | **Uninstalled** |
| Supabase Postgres hosts | **Rejected** at runtime (`*.supabase.co`) |
| Agent tooling | Supabase MCP + skills **removed** (Convex MCP/skills only) |

---

## What was removed

- Supabase Auth clients (`src/server/supabase/*`)
- Env: `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY` (do not set locally)
- npm packages `@supabase/ssr`, `@supabase/supabase-js`
- Project `.cursor/mcp.json` Supabase server entry
- `.agents/skills/supabase*`
- Verify/provision scripts no longer call Supabase Auth / PostgREST

## What replaces it

| Concern | Replacement |
| --- | --- |
| Login / session / passwords | Clerk |
| Convex JWT | Clerk template `convex` + `CLERK_JWT_ISSUER_DOMAIN` |
| Client Convex auth | `ConvexProviderWithClerk` |
| Realtime + typed backend | Convex |
| App user link | `users.clerk_user_id` / Convex `users.authSubject` |
| Health / ready | Clerk + Convex reachability |

## Interim Postgres

**Pastoral runtime no usa Postgres.** Los módulos bajo `src/modules/*` y `src/app/*` llaman Convex (`getAuthenticatedConvexClient` / `getPublicConvexClient`).

`getDb()` / `DATABASE_URL` solo quedan para seed legacy opcional (`src/db/seeds/run.ts`). No configures `*.supabase.co`.

Prefer: `npm run db:seed:convex` + `npm run convex:dev`.

## Operator checklist

1. `npm run convex:dev` (or cloud Convex deploy)
2. Clerk keys + JWT template `convex` + `CLERK_JWT_ISSUER_DOMAIN`
3. `npm run db:seed:convex`
4. Do not set Supabase env vars

**STATUS: SUPABASE PRODUCT REMOVED — CONVEX + CLERK (PASTORAL CUTOVER)**
