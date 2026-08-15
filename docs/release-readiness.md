# Release readiness

## States

| State | Meaning |
| --- | --- |
| `CODE_READY` | Quality gates + security hardening + docs OK; staging not yet proven |
| `STAGING_READY` | Staging deployed and smoke/E2E/health PASS |
| `UAT_READY` | Human UAT checklist PASS on staging |
| `PRODUCTION_APPROVED` | Explicit human approval only |

## Current (Phase 10)

**CODE_READY** + **STAGING_PENDING**

Rationale: code hardening, CI, verify scripts, and docs shipped; Vercel/Supabase staging project not provisioned in this agent run.

## Blockers to STAGING_READY

- Create separate Supabase staging project
- Configure Vercel env + Auth redirect URLs + SMTP
- Deploy, migrate, RLS, seed, run UAT smoke

## Never

- Auto-set `PRODUCTION_APPROVED` from Cursor
- Deploy production without owner approval
