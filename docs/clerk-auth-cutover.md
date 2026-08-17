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

## Fuera de alcance histórico

Supabase Auth/SDK removed — see [`supabase-removal.md`](./supabase-removal.md). Pastoral modules still migrating off interim Drizzle: [`convex-full-cutover-plan.md`](./convex-full-cutover-plan.md).
