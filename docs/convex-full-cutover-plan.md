# MULTIPLICA — Convex FULL_CUTOVER plan

| Campo | Valor |
| --- | --- |
| Fecha | 2026-08-16 |
| Decisión | **FULL_CUTOVER** — Convex es el backend objetivo |
| Motivo | Tipado end-to-end TypeScript, queries/mutations validadas, realtime nativo |
| Stack actual (origen) | Next.js + Supabase Auth + Postgres + Drizzle (+ RLS) |
| Nota | A veces se menciona “T3”; en este repo el backend real es **Supabase/Drizzle**, no tRPC/Prisma. El target es **Next + Convex**. |
| Staging / prod | Sin cutover en prod hasta que cada fase pase verify + UAT en staging |

---

## Principios

1. **Un writer por dominio.** No dual-write en `leadership_closure`, transferencias ni asistencia.
2. **Auth tarde.** Mantener **Supabase Auth** (cookies, recovery, `must_change_password`) mientras migran datos pastorales a Convex. Authz de dominio se reimplementa en Convex (hoy vive en `src/modules/authorization`).
3. **UI estable.** Server actions / páginas pueden llamar Convex gradualmente; no reescribir toda la UI de golpe.
4. **Invariantes primero.** Cada fase debe conservar `docs/domain-invariants.md` y los scripts `verify:*` equivalentes.
5. **Realtime donde aporta.** Células/asistencia, transferencias, dashboards — no forzar subscriptions en pantallas estáticas.

---

## Fases (orden por dependencia)

| Fase | Alcance | Criterio de salida |
| --- | --- | --- |
| **0** | Schema foundation + docs + tooling local; sin cortar Postgres pastoral | `npm run convex:dev` + schema compile; plan aprobado |
| **1** | Catálogos: districts, networks, ministries (+ seed) | Admin org lee/escribe Convex detrás de flag |
| **2** | Authz Convex: roles, permissions, assignments + `AuthContext` | Policies equivalentes a `policy.ts` en tests |
| **3** | Personas / Ganar (+ intake público vía HTTP action) | CRUD personas + registro público; verify persona única |
| **4** | Células, membresías, asistencia | Caps G12 / no-orphan cell rules en tests |
| **5** | Liderazgo G12 + closure | Closure rebuild + activate/deactivate; Auth user create sigue en Supabase Auth |
| **6** | Formación (consolidar → UDV / Destino / EM / Reencuentro) | Ladder + cycles parity |
| **7** | Enviar / ungimiento | Reglas EM3 → eligible |
| **8** | Transferencias pastorales | Flujo + history sin corrupción de árbol |
| **9** | Reporting / dashboard / exports | KPIs derivados sin SQL Postgres |
| **10** | Auth cutover (Convex Auth o bridge) + retirar Drizzle/RLS/`DATABASE_URL` | Login/recovery en Convex; Supabase solo si queda storage opcional |

---

## Mapa origen → Convex

| Origen | Destino |
| --- | --- |
| `src/db/schema/*` | `convex/schema.ts` (+ tablas por dominio) |
| `src/modules/*/service.ts` | `convex/<domain>.ts` queries/mutations |
| `src/modules/*/actions.ts` | Thin Next server actions → `fetchQuery` / `fetchMutation`, o client hooks |
| `src/modules/authorization` | `convex/authz.ts` + helpers `requireActor` |
| Supabase Auth | Fase 10; hasta entonces identidad vía `users.authSubject` = Supabase `auth.users.id` |
| RLS SQL | Authz en mutations (defense in depth Convex rules) |
| Raw SQL reporting | Indexes + aggregations / scheduled jobs |

---

## Dual-run (mientras dura)

| Capa | Estado durante cutover |
| --- | --- |
| Supabase Auth + middleware | **Sigue** |
| Postgres + Drizzle (dominios no migrados) | **Source of truth** |
| Convex (dominios migrados) | **Source of truth** de ese dominio |
| `/convex-dev` | Smoke / connectivity only |

Flag sugerido (fases 1+): `CONVEX_DOMAIN_<NAME>=1` o `NEXT_PUBLIC_USE_CONVEX_ORG=1`.

---

## Riesgos altos

- **Transfers + leadership_closure** — corrupción de árbol G12
- **Leadership activate** — acoplado a `auth.admin.createUser`
- **Reporting** — mucho SQL scoped; reescritura no trivial
- **Password gate / recovery** — no mover hasta fase 10
- **Staging UAT** — no mergear cutover a `main`/prod sin UAT en `staging`

---

## Fase 0 (esta entrega)

- Decisión FULL_CUTOVER documentada
- Schema Convex foundation (tablas vacías + indexes) alineado a catálogos/personas/users/roles
- `convex/README.md` apunta al plan
- Gate doc actualizado
- **No** se elimina Supabase/Drizzle
- **No** se migra data pastoral aún

---

**STATUS: FULL_CUTOVER ACCEPTED — PHASE 0 IN PROGRESS**
