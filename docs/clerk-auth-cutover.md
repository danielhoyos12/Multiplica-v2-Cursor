# MULTIPLICA — Clerk Auth cutover

| Campo | Valor |
| --- | --- |
| Fecha | 2026-08-16 |
| Auth | **Clerk** (`@clerk/nextjs`) |
| Data plane | **Convex** (+ optional interim non-Supabase Postgres) |
| Convex bridge | `convex/auth.config.ts` + `ConvexProviderWithClerk` |

---

## Qué cambió

| Área | Cambio |
| --- | --- |
| Middleware | `clerkMiddleware` + password-gate cookie |
| Login / recuperar | `useSignIn` (Clerk) |
| Session | `auth()` / `currentUser()` → app `users` via `clerk_user_id` |
| Leadership provision | `clerkClient().users.createUser` |
| Password gate | DB `must_change_password` + Clerk `publicMetadata` + cookie |
| Convex client | `ConvexProviderWithClerk` + Clerk `useAuth` |
| Convex server | `CLERK_JWT_ISSUER_DOMAIN` in `auth.config.ts` |
| Env | `NEXT_PUBLIC_CLERK_*` (incl. `SIGN_IN_URL=/login`, `SIGN_UP_URL=/sign-up`), `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_DOMAIN` |

## Identidad

- App `users.id` = UUID interno (FKs / authz en módulos Drizzle interim)
- `users.clerk_user_id` = Clerk `user_…` (unique)
- Convex `users.authSubject` = Clerk subject when profiles live in Convex
- Migración legacy: `0011_clerk_user_id.sql`

## Convex + Clerk setup

1. Clerk Dashboard → JWT Templates → New → **Convex** (name must be `convex`).
2. Set Convex deployment env: `CLERK_JWT_ISSUER_DOMAIN=https://<instance>.clerk.accounts.dev`
3. App already wraps with `ClerkProvider` → `ConvexClientProvider` (`ConvexProviderWithClerk`).

For Vercel previews: set `CLERK_JWT_ISSUER_DOMAIN` once on the Convex **Preview/Dev** deployment defaults (not per Vercel preview). Vercel still needs Clerk Next keys + `CONVEX_DEPLOY_KEY` / `NEXT_PUBLIC_CONVEX_URL`.

## CLI setup (linked app)

Target Clerk application: `app_3I0zc3YzaXVrDXUXSnaqXDfwzjj`

```bash
export PATH="$HOME/.local/bin:$PATH"   # if clerk installed with npm --prefix ~/.local
clerk auth login
clerk init --app app_3I0zc3YzaXVrDXUXSnaqXDfwzjj
clerk doctor
```

Middleware matcher includes `/__clerk/:path*`.

## Security hardening Clerk ↔ Convex

Cadena de identidad (obligatoria):

Clerk session → JWT template exactamente `convex` → `ConvexHttpClient.setAuth(token)` / `ConvexProviderWithClerk` → `ctx.auth.getUserIdentity()` → `users.authSubject` → RBAC/scope

### Identidad

- El actor **nunca** se toma de `actorUserId` enviado por el cliente.
- Helpers Convex: `requireIdentity`, `requireAppUser`, `requireActiveAppUser`, `requirePermission`, `requireMinistryScope`, `requireSuperadmin`.
- Server Next: `getAuthenticatedConvexClient()` pide `auth().getToken({ template: "convex" })` por request (no hay singleton compartido entre usuarios).
- `getPublicConvexClient()` solo para health ping y GANAR público (`persons.createPublic`, catálogos `foundation.*`).

### Provisioning

Flujo de alta:

Persona Maestra → apta → **activateLeader** (Next, server-side) → `clerk.users.createUser` (idempotente por email) → `users.provisionLeaderUser` → `authz.assignRole` (`leader`) → login.

- `ensureProfile` / `linkProvisionedIdentity` **no insertan** usuarios nuevos.
- Identidad Clerk sin fila Convex → `/acceso-denegado` (“Tu cuenta no está habilitada en MULTIPLICA”).
- Signup público eliminado de UI (`SignUpButton`, `/sign-up` redirige a `/login`). `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/login`.

### Restricted mode (HUMAN STEP si la instancia no es la de esta VM)

En Clerk Dashboard → User & Authentication → **Access mode** → **Invite-only** (`sign_up_mode=restricted`).

Google/Apple pueden existir como **método de login** para usuarios ya creados por Backend API; no deben auto-provisionar pastoral.

Instancia de desarrollo local (keyless, `pk_test_`): `clerk config patch` no admite `sign_up_mode` hasta reclamar la app (`clerk auth login`). Allowlist de restrictions se puede activar en esa instancia de desarrollo.

### Variables (no imprimir secretos)

| Variable | Dónde |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Vercel Preview/staging |
| `CLERK_SECRET_KEY` | Vercel Preview/staging |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login` | Vercel + `.env` |
| `NEXT_PUBLIC_CONVEX_URL` | Vercel Preview/staging — deployment Convex **staging**, no local |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | opcional |
| `CONVEX_DEPLOY_KEY` | si el build despliega funciones Convex |
| `CLERK_JWT_ISSUER_DOMAIN` | Convex Dashboard del deployment staging/preview |

JWT template Clerk: nombre exacto `convex`, `aud: convex`.

### UAT pendiente

- Preview Vercel con Deployment Protection / SSO: no navegable desde esta VM.
- `/api/ready` debe ser 200 con `clerkConfigured`, `convexConfigured`, `convexReachable` (query `health.ping`).
- Producción pública (`main`) **no** forma parte de este hardening.

### Rollback

Revertir el commit de hardening en `cursor/convex-pastoral-cutover-a3cc`. No cambiar Production Branch. No mergear a `main`. Restaurar signup solo si un humano lo pide explícitamente.

## Fuera de alcance histórico

Supabase Auth/SDK removed — see [`supabase-removal.md`](./supabase-removal.md). Pastoral runtime is Convex — [`convex-full-cutover-plan.md`](./convex-full-cutover-plan.md).
