# MULTIPLICA — Convex local development setup

| Campo | Valor |
| --- | --- |
| Fecha | 2026-08-16 |
| Modo | `CONVEX_AGENT_MODE=anonymous` (sin cuenta Convex cloud) |
| Auth | Clerk + `ConvexProviderWithClerk` |
| Data plane | Convex (interim non-Supabase Postgres optional) |

---

## Resultado

**Convex local listo** + schema foundation. Auth de la app: **Clerk**.

| Ítem | Estado |
| --- | --- |
| Dep `convex` + scripts `convex:dev` / `convex:once` / `convex:dashboard` | ✅ |
| `auth.config.ts` (Clerk JWT) | ✅ |
| Schema foundation | ✅ |
| Smoke `healthChecks` + `/convex-dev` | ✅ |
| Provider global `ConvexProviderWithClerk` | ✅ |

---

## Cómo correrlo

```bash
npm run convex:dev   # terminal 1 — backend local :3210
npm run dev          # terminal 2 — Next
# abrir http://localhost:3000/convex-dev
```

Para llamadas autenticadas contra un deployment cloud: JWT template Clerk `convex` + `CLERK_JWT_ISSUER_DOMAIN` en el deployment.

---

## Archivos clave

- `convex/auth.config.ts`, `convex/schema.ts`, `convex/health.ts`, `convex/foundation.ts`
- `src/components/convex/convex-client-provider.tsx`
- `docs/clerk-auth-cutover.md`, `docs/supabase-removal.md`

---

**CONVEX LOCAL DEV: READY**  
**AUTH: CLERK + CONVEX JWT**
