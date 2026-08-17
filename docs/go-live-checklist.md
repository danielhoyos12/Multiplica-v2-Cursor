# Go-live checklist

Human approval required for production. Cursor never auto-approves.

## Gates

- [ ] Staging PASS (deploy + Convex + Clerk URLs + health + smoke + E2E critical)
- [ ] UAT checklist executed on staging
- [ ] Backups / snapshot confirmed on production Convex (and interim DB if used)
- [ ] Production Clerk + Convex projects created (not shared dev)
- [ ] Clerk JWT template `convex` + `CLERK_JWT_ISSUER_DOMAIN` on Convex prod
- [ ] Interim Postgres migrations/RLS only if still required (never Supabase hosts)
- [ ] Production seed = catalogs/permissions **only** (no Phase* fixtures)
- [ ] Env vars on Vercel (public vs server separated)
- [ ] Clerk allowed origins / redirect URLs (staging/prod)
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
