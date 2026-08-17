# MULTIPLICA — Convex FULL_CUTOVER plan

| Campo | Valor |
| --- | --- |
| Fecha | 2026-08-17 |
| Decisión | **FULL_CUTOVER** — Convex es el backend objetivo |
| Auth | **Clerk** (completado) |
| Data plane | **Convex** (completado en código — pastoral modules) |
| Branch | `cursor/convex-pastoral-cutover-a3cc` |

---

## Estado

| Fase | Alcance | Estado |
| --- | --- | --- |
| **0** | Schema + tooling local | ✅ |
| **1** | Catálogos (districts, networks, ministries) + seed | ✅ `convex/organization.ts`, `seed.ts` |
| **2** | Authz (roles, permissions, assignments) | ✅ `convex/authz.ts` |
| **3** | Personas / Ganar | ✅ `convex/persons.ts` + `ganar/service` |
| **4** | Células / membresías / asistencia | ✅ `convex/cells.ts` |
| **5** | Liderazgo G12 + closure | ✅ `convex/leadership.ts` (Clerk createUser en Next) |
| **6** | Formación | ✅ `convex/formation.ts` |
| **7** | Enviar | ✅ `convex/send.ts` |
| **8** | Transferencias | ✅ `convex/transfers.ts` |
| **9** | Reporting / dashboard | ✅ `convex/reporting.ts` |
| **10** | Auth Clerk + retirar path feliz Drizzle | ✅ módulos/app sin `getDb()` |

`getDb()` solo permanece en `src/db/client.ts` (legacy helper) y `src/db/seeds/run.ts` (seed Postgres histórico). Pastoral runtime usa Convex.

---

## Operación

```bash
npm run convex:dev          # backend local
npm run db:seed:convex      # catálogos RBAC + redes + distritos
npm run dev
```

Env requerido: `NEXT_PUBLIC_CONVEX_URL`, Clerk keys, `CLERK_JWT_ISSUER_DOMAIN` en el deployment Convex.

## Security hardening Clerk ↔ Convex

Ver [`docs/clerk-auth-cutover.md`](./clerk-auth-cutover.md). Resumen:

- Authz real en Convex via `ctx.auth` (no `actorUserId` de cliente).
- JWT Clerk template `convex` en SSR (`getAuthenticatedConvexClient`).
- Sin signup público; alta solo por `provisionLeaderUser` / `activateLeader`.
- `seedCatalogs` y `seedSuperadminRole` son `internalMutation`.
- `/api/ready` = Clerk + Convex `health.ping` (no Postgres).

---

**STATUS: FULL_CUTOVER CODE COMPLETE — HARDENING IN PR #23 — UAT STAGING PENDING**
