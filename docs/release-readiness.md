# Release readiness

## States

| State | Meaning |
| --- | --- |
| `CODE_READY` | Quality gates + security hardening + docs OK; staging not yet proven |
| `STAGING_READY` | Staging deployed and smoke/E2E/health PASS |
| `UAT_READY` | Human UAT checklist PASS on staging |
| `PRODUCTION_APPROVED` | Explicit human approval only |

## Current (Phase 5 UI preprod)

**CODE_READY** + **PREPROD_VALIDATED_ON_DEV** + **STAGING_PENDING** + **NO-GO PRODUCTION**

Rationale: Phase 5 authenticated E2E + export security + visual QA ran against `multiplica-dev` / local Next; critical export authz bypass fixed. Dedicated staging project, human UAT, and production env still required before GO.

See [ui-phase-5-preprod-readiness.md](./ui-phase-5-preprod-readiness.md).

## Blockers to STAGING_READY

- Create separate Supabase staging project
- Configure Vercel env + Auth redirect URLs + SMTP
- Deploy, migrate, RLS, seed, run UAT smoke

## Never

- Auto-set `PRODUCTION_APPROVED` from Cursor
- Deploy production without owner approval
