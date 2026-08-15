# RLS matrix (Phase 10)

Inventory of sensitive tables. Policies live in `src/db/rls/*.sql`. Re-apply via `./scripts/apply-rls.sh` (idempotent `DROP POLICY IF EXISTS`).

| Table | RLS | FORCE | Anon | Authenticated SELECT | Writes | Service boundary |
| --- | --- | --- | --- | --- | --- | --- |
| districts | Y | Y | DENY | active catalogs | service / admin | service for mutations |
| ministries | Y | Y | DENY | active | service / admin | service |
| networks | Y | Y | DENY | active/configurable | service / admin | service |
| persons | Y | Y | DENY | deny/default; scoped via later policies where present | server services | preferred |
| users | Y | Y | DENY | own row | own limited update | service for admin |
| roles / permissions / role_permissions | Y | Y | DENY | authenticated read | service | service |
| user_role_assignments | Y | Y | DENY | own | service | service |
| person_organization_history | Y | Y | DENY | deny / scoped | service | service |
| audit_logs | Y | Y | DENY | deny / superadmin paths | service insert | service only |
| person_intake_events | Y | Y | DENY | deny | service | service |
| cells / memberships / attendance* | Y | Y | DENY | tree/ministry scoped | service | service |
| person_leadership / leadership_closure | Y | Y | DENY | tree scoped | service | service |
| training_* / person_process_* | Y | Y | DENY | scoped | service | service |
| pastoral_transfer_requests | Y | Y | DENY | scoped | service | service |
| leadership_relationship_history / cell_leadership_history | Y | Y | DENY | scoped | service | service |

Notes:

- Exact policy names evolve per phase file (`001`–`010`); this matrix is the operational contract.
- Anonymous PostgREST access to pastoral tables must return error or empty — verified in `scripts/verify-phase10-release.ts`.
- App mutations use Drizzle `DATABASE_URL` after domain authz; do not weaken RLS to compensate for missing checks.

## Expected anonymous surface

| Path / action | Allowed |
| --- | --- |
| `/ganar/registro` public submit | Yes (controlled) |
| `/api/health` | Yes (no secrets) |
| `/login`, `/recuperar` | Yes |
| persons/cells/leadership/transfers/reports/audit | No |

## Drift

Compare schema migrations `0000`–`0010` + RLS files against `multiplica-dev`. Target: drift=0 or documented exception in phase-10 cierre.
