# MULTIPLICA — Architecture (current)

## Product sequence

```text
GANAR
→ CONSOLIDAR (Pre-Encuentro → Encuentro → Post-Encuentro)
→ DISCIPULAR (CD1 → CD2 → Re-Encuentro → CD3 → EM1 → EM2 → EM3)
→ ENVIAR
```

## Stack

| Layer | Choice |
| --- | --- |
| Web | Next.js App Router + TypeScript + Tailwind |
| Backend | Modular monolith (server actions + domain modules) |
| Database | PostgreSQL (Supabase host OK) + Drizzle |
| Authn | **Clerk** |
| Authz | Domain policies + RLS deny-by-default |
| ORM | Drizzle + versioned SQL migrations `0000`–`0011` |
| Deploy | Vercel + Clerk + Postgres (recommended) |

## Modules (implemented)

Persona Maestra · Ministerios/Redes · Células/membresías/asistencia · Liderazgo G12 + closure · Formación · Enviar/ungimiento · Transferencias · Dashboards/reportes/alertas · System health · RLS/authz · Auditoría

## Folder structure

```text
src/app/          # routes (auth, public intake, app shell, api)
src/components/   # UI
src/modules/      # domain services + actions
src/db/           # schema, migrations, seeds, rls/
src/lib/          # env, errors, redirects, prod-guard
src/server/       # auth session helpers (Clerk)
docs/             # architecture, security, ops, phase cierres
e2e/              # Playwright smoke
```

Auth cutover notes: [`docs/clerk-auth-cutover.md`](./clerk-auth-cutover.md).

## Server / client

- Browser: Clerk publishable key (`NEXT_PUBLIC_CLERK_*`).
- Server Components / Actions: Clerk session (`auth()` / `currentUser()`).
- Privileged Auth ops: Clerk Backend API (`clerkClient`, secret key).
- SQL: Drizzle via `DATABASE_URL` after domain authorization.

## Auth hardening (Phase 10)

- Protected pastoral prefixes in middleware.
- `must_change_password` hard gate in app layout.
- Safe internal redirects; forgot password at `/recuperar`.
- `/api/health` (liveness) and `/api/ready` (DB readiness).

## RLS pipeline

```bash
npm run db:migrate
./scripts/apply-rls.sh   # idempotent DROP IF EXISTS + CREATE
npm run db:seed          # catalogs; production: no Phase fixtures
```

## Observability

Minimal: structured server errors, audit for business actions, health endpoints. Sentry optional post-go-live (not required for RC).

## Non-goals (out of Phase 10)

New pastoral workflows · microservices · second database · native mobile · auto production deploy · WhatsApp/push/ML/billing.
