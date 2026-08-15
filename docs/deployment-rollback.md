# Deployment & rollback

## App (Vercel)

1. Prefer promote previous **Ready** deployment in Vercel (instant app rollback).
2. Keep `main` protected; roll forward with a fix PR when possible.
3. Preview deploys on PRs once Vercel is connected.

## Database

**There is no automatic down-migration.**

| Incident | Action |
| --- | --- |
| Bad app deploy | Rollback Vercel deployment |
| Bad migration | Forward-fix migration preferred; restore from backup only if data corrupted |
| Auth misconfig | Fix Supabase Auth URLs / SMTP; revoke sessions as needed |
| Leaked secret | Rotate service role + DB password + Vercel envs; see secret rotation below |

## Pipeline (staging / production)

```text
backup/snapshot → migrate (Drizzle) → apply-rls.sh → seed catalogs (prod: no fixtures) → deploy app → /api/health + /api/ready
```

Never migrate on every server request.

## Secret rotation

1. Generate new Supabase service role / DB password in dashboard.
2. Update Vercel env (staging then production).
3. Redeploy.
4. Invalidate old credentials; review audit logs for abuse window.

## Environments

| Env | Supabase | App |
| --- | --- | --- |
| LOCAL | personal / multiplica-dev | `next dev` |
| STAGING | separate project | Vercel staging/preview |
| PRODUCTION | separate project | Vercel production |

Do not use `multiplica-dev` as production.
