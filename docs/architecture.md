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
| Backend | Domain modules → **Convex** queries/mutations |
| Database | **Convex** (Supabase removed) |
| Authn | **Clerk** |
| Authz | Domain policies in app / Convex |
| Realtime | Convex subscriptions |
| Deploy | Vercel + Clerk + Convex |

Cutover: [`docs/supabase-removal.md`](./supabase-removal.md) · Convex plan: [`docs/convex-full-cutover-plan.md`](./convex-full-cutover-plan.md) · Auth: [`docs/clerk-auth-cutover.md`](./clerk-auth-cutover.md)

## Modules (implemented)

Persona Maestra · Ministerios/Redes · Células/membresías/asistencia · Liderazgo G12 + closure · Formación · Enviar/ungimiento · Transferencias · Dashboards/reportes/alertas · System health · Authz · Auditoría

## Folder structure

```text
src/app/          # routes (auth, public intake, app shell, api)
src/components/   # UI
src/modules/      # domain services + actions (Convex-backed)
convex/           # schema + Convex functions
src/lib/          # env, errors, redirects, prod-guard
src/server/       # Clerk session + Convex HTTP client
docs/             # architecture, security, ops
e2e/              # Playwright smoke
```

## Server / client

- Browser: Clerk publishable key + `NEXT_PUBLIC_CONVEX_URL`
- Server: Clerk `auth()` / `clerkClient`; Convex `ConvexHttpClient`
- **No Supabase** (Auth, SDK, or hosted DB)

## Observability

Minimal: structured server errors, audit for business actions, health endpoints.

## Non-goals

Microservices · native mobile · auto production deploy · WhatsApp/push/ML/billing.
