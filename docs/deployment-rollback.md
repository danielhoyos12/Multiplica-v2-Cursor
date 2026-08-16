# Deployment & rollback

## App (Vercel)

1. Prefer promote previous **Ready** deployment in Vercel (instant app rollback).
2. Keep `main` protected; roll forward with a fix PR when possible.
3. Preview deploys on PRs once Vercel is connected.

## Data plane

**There is no automatic down-migration** for interim Postgres. Convex schema pushes are managed via `npx convex deploy` / dashboard.

| Incident | Action |
| --- | --- |
| Bad app deploy | Rollback Vercel deployment |
| Bad Convex push | Redeploy previous Convex revision / forward-fix functions |
| Bad interim Postgres migration | Forward-fix preferred; restore from backup only if data corrupted |
| Auth misconfig | Fix Clerk URLs / JWT template `convex` / `CLERK_JWT_ISSUER_DOMAIN`; revoke sessions |
| Leaked secret | Rotate Clerk secret + Convex deploy key (+ interim DB password if any); see secret rotation |

## Pipeline (staging / production)

```text
Convex deploy → (optional interim migrate + apply-rls + seed catalogs) → deploy app → /api/health + /api/ready
```

Never migrate on every server request.

## Secret rotation

1. Rotate `CLERK_SECRET_KEY` in Clerk + Vercel.
2. Rotate `CONVEX_DEPLOY_KEY` / deployment credentials as needed.
3. If interim Postgres: rotate DB password and update Vercel `DATABASE_URL`.
4. Redeploy; invalidate old credentials; review audit logs for abuse window.

## Environments

| Env | Auth | Data | App |
| --- | --- | --- | --- |
| LOCAL | Clerk test | Anonymous/local Convex | `next dev` |
| STAGING | Clerk staging | Convex staging (+ optional interim DB) | Vercel staging/preview |
| PRODUCTION | Clerk prod | Convex prod | Vercel production |

Do not use shared personal/dev projects as production.
