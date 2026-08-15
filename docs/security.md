# MULTIPLICA — Security

## Auth

- Supabase Auth (email/password).
- Middleware refreshes session cookies and protects pastoral routes.
- Login errors are neutral (no user enumeration).
- `must_change_password` is enforced in `(app)/layout`: only password change, logout, and technical routes are allowed until cleared.
- Password reset: `/recuperar` via `resetPasswordForEmail` (neutral success message).
- Inactive app users (`users.is_active = false`) are redirected away from the app shell.

## Authorization

- Domain permissions + ministry/network/tree scope in server services.
- Client never supplies authoritative `actorId`.
- Mutations validate session actor server-side.

## RLS

- Enabled + FORCE on foundation and phase tables.
- Anonymous: deny by default for pastoral tables; public intake is a controlled server action.
- Authenticated policies are narrow; privileged writes prefer server services + service role where designed.
- See [security-rls-matrix.md](./security-rls-matrix.md).

## Service role

- `SUPABASE_SERVICE_ROLE_KEY` is server-only.
- Never import admin/service-role clients from Client Components.
- Anon key is public by design.

## Secrets

| Variable | Surface |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_*` | Browser |
| `NEXT_PUBLIC_APP_URL` | Browser |
| `SUPABASE_SERVICE_ROLE_KEY` | Server |
| `DATABASE_URL` | Server |

Verify scripts refuse `APP_ENV=production` and production-looking DB URLs.

## PII

- Name, phone, email, address, prayer request.
- Prayer request: detail for authorized actors only — never dashboard KPIs, CSV exports, audit metadata, or client error payloads.

## Exports

- CSV cells sanitized against formula injection (`=`, `+`, `-`, `@`).
- Scope filtered by actor permissions.

## Public form (`/ganar/registro`)

- Honeypot field + rate limiting (existing).
- Neutral errors (no duplicate enumeration).
- Privacy consent placeholder text.

## Audit vs logs

- `audit_logs`: important business actions (no passwords, no prayer text).
- Server logs: technical errors with redaction; never dump secrets or full sensitive payloads.

## Headers

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` (camera/mic/geo disabled)
- `X-Frame-Options: DENY`
- CSP: recommended post-go-live after Next/Supabase compatibility testing (documented warning).

## Incident basics

See [operations-runbook.md](./operations-runbook.md) and [deployment-rollback.md](./deployment-rollback.md).
