# Go-live checklist

Human approval required for production. Cursor never auto-approves.

## Gates

- [ ] Staging PASS (deploy + migrate + RLS + seed + auth URLs + health + smoke + E2E critical)
- [ ] UAT checklist executed on staging
- [ ] Backups / snapshot confirmed on production project
- [ ] Production Supabase project created (not multiplica-dev)
- [ ] Migrations applied (`0000`–`0010`)
- [ ] RLS applied (`apply-rls.sh`)
- [ ] Production seed = catalogs/permissions **only** (no Phase* fixtures)
- [ ] Env vars on Vercel (public vs server separated)
- [ ] Auth Site URL + redirect URLs (staging/prod)
- [ ] SMTP configured for password reset emails
- [ ] Superadmin bootstrap completed and credentials secured
- [ ] `/api/health` and `/api/ready` OK
- [ ] System health critical=0
- [ ] Rollback plan reviewed ([deployment-rollback.md](./deployment-rollback.md))
- [ ] Owner written approval recorded

## After first production deploy

- [ ] Smoke login + Ganar + dashboard
- [ ] Monitor errors 24h
- [ ] No fixture verify scripts against production

## Stop conditions

Any **BLOCKER** in [release-readiness.md](./release-readiness.md) → do not promote.
