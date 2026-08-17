# Operations runbook

## Create user (leader)

1. Activate leadership from Persona Maestra (creates Clerk user + temp password once).
2. User must change password on first access (`must_change_password`).
3. Assign roles in Admin → Usuarios if needed beyond default leader role.

## Assign Líder General

1. Activate with “raíz ministerial” (Superadmin) or transfer structure per pastoral plan.
2. Confirm ministry scope and closure tree.

## Bootstrap Superadmin

1. Create user in **Clerk** (staging/prod instance).
2. Ensure app `users` row exists (`ensureAppUserProfile` on first login or seed bootstrap).
3. Assign `superadmin` role via controlled seed/script — no hardcoded backdoor.
4. Document the human owner of the account offline (not in git).

## Reset password

- Self-service: `/recuperar` (Clerk).
- Configure Clerk allowed origins / redirect URLs for staging/prod.
- Operator: Clerk Dashboard → user → reset password; never store passwords in app DB.

## Review system health

1. `/admin/system-health` (Superadmin).
2. Or `CRITICAL_FAIL=1 npm run verify:invariants` against staging/dev (interim Postgres only).

## Transferencias

1. Create request → approve → execute with confirmation.
2. Validate new scope; old sibling/ministry DENY.
3. Audit log should record business action without secrets.

## Incident basics

| Symptom | First check |
| --- | --- |
| Login broken | Clerk keys, redirect URLs, Clerk status |
| Empty pastoral data | Actor scope / roles; Convex URL; interim DB if still used |
| Health 503 | `/api/ready` Clerk + Convex reachability |
| Suspected leak | Rotate Clerk secret + Convex deploy key; revoke sessions |

## Session revocation

Clerk: sign out / ban / reset password. App `is_active=false` blocks shell access.
