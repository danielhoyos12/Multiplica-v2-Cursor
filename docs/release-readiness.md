# Release readiness

## States

| State | Meaning |
| --- | --- |
| `CODE_READY` | Quality gates + security hardening + docs OK; staging not yet proven |
| `STAGING_READY` | Staging deployed and smoke/E2E/health PASS |
| `UAT_READY` | Human UAT checklist PASS on staging |
| `PRODUCTION_APPROVED` | Explicit human approval only |

## Current

**CODE_READY** + stack cutover to **Clerk + Convex** in progress · **STAGING_PENDING** · **NO-GO PRODUCTION**

See [supabase-removal.md](./supabase-removal.md) and [clerk-auth-cutover.md](./clerk-auth-cutover.md).

## Blockers to STAGING_READY

- Configure Vercel env: Clerk keys, `NEXT_PUBLIC_CONVEX_URL`, Convex deploy key
- Set `CLERK_JWT_ISSUER_DOMAIN` on Convex staging/preview defaults
- Clerk JWT template named `convex`
- Deploy, smoke, run UAT

## Never

- Auto-set `PRODUCTION_APPROVED` from Cursor
- Deploy production without owner approval
- Point `DATABASE_URL` at Supabase hosts
