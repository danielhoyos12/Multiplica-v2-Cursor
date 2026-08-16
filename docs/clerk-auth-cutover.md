# MULTIPLICA — Clerk Auth cutover

| Campo | Valor |
| --- | --- |
| Fecha | 2026-08-16 |
| Branch | `cursor/clerk-auth-a3cc` |
| Antes | Supabase Auth (`@supabase/ssr`) |
| Ahora | **Clerk** (`@clerk/nextjs`) |
| Data plane | Postgres + Drizzle sin cambios pastorales |

---

## Qué cambió

| Área | Cambio |
| --- | --- |
| Middleware | `clerkMiddleware` + password-gate cookie |
| Login / recuperar | `useSignIn` (Clerk) |
| Session | `auth()` / `currentUser()` → `users` via `clerk_user_id` |
| Leadership provision | `clerkClient().users.createUser` |
| Password gate | DB `must_change_password` + Clerk `publicMetadata` + cookie |
| Env | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` |

## Identidad

- `users.id` = UUID interno (FKs / authz)
- `users.clerk_user_id` = Clerk `user_…` (unique)
- Migración: `0011_clerk_user_id.sql`

## CLI setup (linked app)

Target Clerk application: `app_3I0zc3YzaXVrDXUXSnaqXDfwzjj`

```bash
export PATH="$HOME/.local/bin:$PATH"   # if clerk installed with npm --prefix ~/.local
clerk auth login
clerk init --app app_3I0zc3YzaXVrDXUXSnaqXDfwzjj
clerk doctor
```

`clerk init` writes keys into the project env. Middleware matcher includes `/__clerk/:path*`.

Usuarios legacy de Supabase Auth **no** inician sesión hasta recrearlos en Clerk (o link por email al primer login vía `ensureAppUserProfile`).

## Fuera de alcance (aún)

- Reescribir scripts `verify-phase*` / `provision-e2e-users` (siguen usando cliente Supabase para RLS PostgREST)
- Quitar paquetes `@supabase/*` del lockfile
- Migrar data pastoral a Convex
