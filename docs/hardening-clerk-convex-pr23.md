# MULTIPLICA — Hardening pass Clerk + Convex + Vercel

| Campo | Valor |
| --- | --- |
| Fecha | 2026-08-17 |
| Repo | `danielhoyos12/Multiplica-v2-Cursor` |
| Branch | `cursor/convex-pastoral-cutover-a3cc` |
| PR | [#23](https://github.com/danielhoyos12/Multiplica-v2-Cursor/pull/23) — draft, **no mergeado** |
| Base | `staging` |
| Commit de hardening | `ee14978` |
| Recomendación | **BLOCKED** para merge. Código **listo para revisión humana**. |

Este informe es la salida del hardening técnico de Clerk + Convex + Vercel pedido sobre PR #23. No implementa features pastorales nuevas. No toca `main` ni Production.

---

## Recomendación final

**BLOCKED** para aprobar/merge.

El código de hardening está en el PR y pasa lint, typecheck, tests, build y CI GitHub. Falta cablear Convex cloud + variables Vercel Preview/staging y Restricted mode en Clerk. Hasta esos HUMAN STEPS, `/api/ready` en preview no puede quedar `200 ready`.

El PR permanece **draft**. No se marcó ready for review. No se mergeó.

---

## 1. Root causes encontradas

1. `getConvexHttpClient()` era un **singleton HTTP sin JWT Clerk**. `ConvexProviderWithClerk` autentica el cliente de browser; **no** autentica `ConvexHttpClient` usado en SSR, Server Actions ni Route Handlers.
2. Las mutations Convex confiaban en `actorUserId` / `createdByUserId` enviados por Next. Eso permitía impersonación si alguien llamaba Convex directo.
3. `users.ensureProfile` **insertaba** un `users` activo (`isActive: true`) para cualquier identidad Clerk desconocida.
4. Signup público en UI (`SignUpButton`, `/sign-up`, auto-provision en `(app)/layout` y `getSessionUser()`).
5. Preview `/api/ready` respondió `503 not_ready` con `convexConfigured: false` y `convexReachable: false`: Vercel **construye** el proyecto, pero **no hay Convex cloud operativo** en ese entorno.
6. En esta VM, Convex es `anonymous:anonymous-agent` (`NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3210`). No es el deployment que Preview/staging deberían usar.
7. `seedCatalogs`, `seedSuperadminRole` y `users.remove` eran mutations públicas utilizables sin identidad.

---

## 2. Riesgos corregidos (código)

- Llamadas autenticadas Next → Convex envían el JWT template **`convex`** vía `getAuthenticatedConvexClient()` + `setAuth(token)`.
- El actor Convex se deriva de `ctx.auth.getUserIdentity()` → `users.authSubject`. Los IDs de argumento son recurso/target, no identidad.
- Identidad Clerk desconocida **no** crea usuario MULTIPLICA activo. No asigna roles.
- Sesión Clerk sin perfil Convex → `/acceso-denegado` (“Tu cuenta no está habilitada en MULTIPLICA”). Sin dashboard.
- Signup público eliminado de la UI. `/sign-up` redirige a `/login?notice=no-signup`.
- `seedCatalogs` y `seedSuperadminRole` son `internalMutation` (CLI admin, no el cliente Next).
- `/api/health` = proceso Next vivo. `/api/ready` = Clerk + Convex `health.ping` (no Postgres).
- `activateLeader`: `clerk.users.createUser` server-side, idempotente por email, rollback Clerk+Convex, password temporal no se escribe en logs.
- GANAR público queda explícitamente público: `getPublicConvexClient()` + `persons.createPublic` + catálogos `foundation.*`.
- `getDb()` no se usa en `src/modules/*` ni `src/app/*`. Comentario de `src/db/client.ts` actualizado: legacy histórico, no módulos pastorales pendientes.

---

## 3. Riesgos todavía abiertos

- Preview/staging **sin Convex cloud** → `/api/ready` no puede pasar a `200` hasta el HUMAN STEP de Vercel + Convex.
- Cadena Clerk issuer ↔ Convex cloud ↔ Vercel **BLOCKED** para el deployment que usa Preview (no se identificó un Convex cloud de staging desde esta VM).
- Clerk `sign_up.mode` sigue **`public`**. Restricted / Invite-only no se pudo setear: la app Clerk de `.env.local` es keyless sin reclamar; `clerk config patch` rechaza `sign_up_mode`.
- Google OAuth sigue habilitado en esa instancia de desarrollo. El código ya no auto-provisiona pastoral; Restricted mode en Dashboard sigue pendiente.
- UAT web de Preview/staging bloqueado por **Deployment Protection / SSO**. No se desactivó.
- Authz Convex **live** (JWT real contra cloud) no se prueba en CI. Hay tests unitarios/estáticos; UAT live queda pendiente.

---

## 4. Lista de archivos modificados

Commit `ee14978` — 68 files.

### Nuevos

- `convex/lib/identity.ts`
- `src/app/(auth)/acceso-denegado/page.tsx`
- `src/modules/security/clerk-convex-hardening.test.ts`
- `docs/hardening-clerk-convex-pr23.md` (este informe)

### Convex

- `convex/users.ts`, `convex/authz.ts`, `convex/seed.ts`, `convex/audit.ts`, `convex/health.ts`
- `convex/persons.ts`, `convex/organization.ts`, `convex/cells.ts`, `convex/leadership.ts`
- `convex/formation.ts`, `convex/send.ts`, `convex/transfers.ts`, `convex/reporting.ts`
- `convex/_generated/api.d.ts`

### Next / auth / API

- `src/server/convex.ts`, `src/server/auth.ts`, `src/server/actor.ts`
- `src/middleware.ts`, `src/app/layout.tsx`, `src/app/(app)/layout.tsx`
- `src/app/(auth)/login/page.tsx`, `src/app/(auth)/sign-up/page.tsx`, `src/app/(auth)/bienvenida/page.tsx`
- `src/components/auth/clerk-auth-controls.tsx`, `src/components/auth/login-form.tsx`
- `src/app/api/health/route.ts`, `src/app/api/ready/route.ts`, `src/app/auth/callback/route.ts`
- `src/lib/env.ts`, `.env.example`

### Servicios Next (cliente autenticado; sin `actorUserId` hacia Convex)

- `src/modules/ganar/service.ts`, `src/modules/organization/service.ts`
- `src/modules/cells/service.ts`, `src/modules/leadership/service.ts`, `src/modules/leadership/password-actions.ts`
- `src/modules/formation/*`, `src/modules/send/service.ts`, `src/modules/transfers/service.ts`
- `src/modules/reporting/*`, `src/modules/audit/logger.ts`, `src/modules/authorization/context.ts`
- Páginas: dashboard, transferencias, ganar/[id]

### Docs / ops

- `docs/clerk-auth-cutover.md` (sección *Security hardening Clerk ↔ Convex*)
- `docs/convex-full-cutover-plan.md`, `docs/resumen-cutover-convex-clerk.md`, `docs/supabase-removal.md`
- `README.md`, `scripts/seed-convex.ts`, `src/db/client.ts`

---

## 5. Arquitectura auth final

```
Clerk session
    → JWT template exactamente `convex`  (aud = convex)
    → Next server: getAuthenticatedConvexClient() + setAuth(token)
    → Browser: ConvexProviderWithClerk
    → Convex ctx.auth.getUserIdentity()
    → users.authSubject = identity.subject (Clerk user_…)
    → App User activo
    → RBAC (roles/permissions) + scope (ministryIds / networkIds)
```

Helpers Convex: `requireIdentity`, `requireAppUser`, `requireActiveAppUser`, `requirePermission`, `requireAnyPermission`, `requireMinistryScope`, `requireNetworkScope`, `requireSuperadmin`, `requireSelfOrPermission`.

Clientes Next:

| Cliente | Uso |
| --- | --- |
| `getAuthenticatedConvexClient()` | RSC, Server Actions, Route Handlers pastorales. **Por request**, no singleton entre usuarios. |
| `getPublicConvexClient()` | Solo operaciones explícitamente públicas: `health.ping`, GANAR público, catálogos `foundation.*`. |

`getConvexHttpClient()` queda como alias deprecado del cliente público. No usarlo para datos pastorales.

---

## 6. Flujo de alta de líder final

```
Persona Maestra
  → cumple requisitos
  → líder eligible (markEligible)
  → activateLeader (Next, server-side)
      → clerk.users.createUser (o reutiliza usuario Clerk existente por email)
      → convex users.provisionLeaderUser  (requiere permiso leaders.activate)
      → convex authz.assignRole(leader)   (createdBy = actor JWT)
      → célula evangelística + estado leadership active
  → el usuario inicia sesión en /login
```

No existe:

```
visitante → signup Clerk → users activo en Convex
```

Si alguien se autentica en Clerk sin perfil MULTIPLICA:

- no se inserta `users`
- no se asignan roles
- se muestra `/acceso-denegado`
- no entra al dashboard

---

## 7. Quality gates

| Gate | Resultado |
| --- | --- |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | **175 PASS** (16 files) |
| `npm run build` | PASS |
| GitHub CI `quality` | PASS — [run 31990919706](https://github.com/danielhoyos12/Multiplica-v2-Cursor/actions/runs/31990919706) |
| Vercel Preview | READY |

Tests añadidos en `src/modules/security/clerk-convex-hardening.test.ts`:

1. UI sin signup público (`SignUpButton` / link `/sign-up`).
2. `ensureProfile` / `linkProvisionedIdentity` no insertan usuarios desconocidos.
3. Mutations Convex sin `actorUserId` en `args`.
4. Seed admin es `internalMutation`.
5. Cliente server documenta JWT template `convex`.
6. `requireIdentity` falla sin JWT.
7. Identidad Clerk desconocida → FORBIDDEN (no App User).
8. Usuario inactivo no opera.
9. Superadmin bypass de permisos.
10. Líder ministerio A no tiene scope de ministerio B (policy).
11. Identidad JWT no se reemplaza por un id spoofeado.
12. `/api/ready` 503 si Convex falta; no usa `databaseConfigured`.
13. `/api/health` 200 (liveness) aunque falte Convex.

UAT live Clerk↔Convex en Preview: **pendiente** (SSO).

---

## 8. Estado `/api/ready`

Código nuevo (este PR):

```json
{
  "status": "ready" | "not_ready",
  "checks": {
    "clerkConfigured": true | false,
    "convexConfigured": true | false,
    "convexReachable": true | false
  }
}
```

- `200` solo si los tres checks son true.
- Reachability: query pública `health.ping` (no secretos).
- Postgres **no** es condición del stack nuevo.

| Entorno | Observación |
| --- | --- |
| Preview (branch PR #23) | Hallazgo previo: **503** `convexConfigured: false`, `convexReachable: false`. Desde esta VM el GET actual es **HTTP 302** (Deployment Protection / SSO). |
| Staging | SSO. No navegable desde esta VM. |
| Production pública | Sigue shape antiguo `databaseConfigured` / Postgres. **Esperado: no se tocó.** |

Preview URLs:

- Branch: https://multiplica-v2-cursor-git-cursor-convex-pasto-09e649-multiplica1.vercel.app
- Esta revisión: https://multiplica-v2-cursor-mcizxjhqo-multiplica1.vercel.app

---

## 9. Variables — PRESENT / MISSING / UNVERIFIABLE

No se imprimen secretos, tokens ni JWT.

### Vercel Preview / staging

`VERCEL_TOKEN` / CLI: **MISSING** (CLI logged out). No se listaron env vars del proyecto Vercel desde esta VM.

| Variable | Estado |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | UNVERIFIABLE ahora. Probe externo previo: PRESENT (`clerkConfigured: true`) |
| `CLERK_SECRET_KEY` | UNVERIFIABLE |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | UNVERIFIABLE |
| `NEXT_PUBLIC_CONVEX_URL` | Probe externo previo: **MISSING** (`convexConfigured: false`). Ahora UNVERIFIABLE |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | UNVERIFIABLE |
| `CONVEX_DEPLOY_KEY` | UNVERIFIABLE / MISSING en el proceso de esta VM |

### Convex

| Variable / dato | Estado |
| --- | --- |
| Deployment usado por esta VM | `anonymous:anonymous-agent` (local). **No** es staging cloud. |
| `CLERK_JWT_ISSUER_DOMAIN` (local) | PRESENT — issuer host `boss-gull-2637.clerk.accounts.dev` |
| `CLERK_JWT_ISSUER_DOMAIN` (cloud staging/preview) | UNVERIFIABLE — no se identificó inequívocamente un deployment cloud de staging. No se modificó ningún deployment que pudiera ser producción. |
| `NEXT_PUBLIC_CONVEX_URL` local | PRESENT — `127.0.0.1:3210` |

### Clerk (instancia de `.env.local`, development / keyless)

| Dato | Estado |
| --- | --- |
| JWT template nombre exacto `convex` | **PRESENT** (`aud: convex`, RS256) |
| Issuer | `https://boss-gull-2637.clerk.accounts.dev` |
| `sign_up.mode` | `public` — Restricted **no aplicado** |
| Allowlist | PATCH backend `allowlist: true` en esta instancia keyless; FAPI siguió mostrando allowlist disabled (inconsistente / cache). No sustituye Invite-only. |
| OAuth Google | habilitado en FAPI (método de login; no debe auto-provisionar pastoral) |
| OAuth apps Backend API | lista vacía |

---

## 10. HUMAN STEPS exactos

### Clerk

1. En el Dashboard de la **misma instancia que usa Vercel Preview/staging** (si no es la keyless local, repetir allí):
   - User & Authentication → **Access mode** → **Invite-only** (`sign_up_mode=restricted`).
2. Confirmar JWT template llamado **exactamente** `convex` con `aud: convex`.
3. Google/Apple pueden quedar como métodos de **login** para usuarios ya creados con `clerk.users.createUser`. No como registro libre.
4. Reclamar la app keyless (`clerk auth login`) solo si se quiere gestionar `sign_up_mode` por CLI. No es obligatorio si se hace en Dashboard.

### Convex

1. Crear o identificar el deployment **cloud de staging/preview** (no production, no `anonymous` local).
2. En ese deployment: `CLERK_JWT_ISSUER_DOMAIN` = issuer Clerk real (ejemplo local: `https://boss-gull-2637.clerk.accounts.dev`).
3. Desplegar las funciones de este branch a ese deployment (`npx convex deploy` con la deploy key de **staging**, nunca prod).
4. No modificar un deployment de producción sin aprobación humana explícita.

### Vercel

Preview + **staging**. **No** Production. **No** cambiar Production Branch.

1. `NEXT_PUBLIC_CONVEX_URL` = URL `https://….convex.cloud` del deployment del paso Convex.
2. `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`.
3. `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login`
4. `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/login` (no hay signup público).
5. `CONVEX_DEPLOY_KEY` si el build de Vercel despliega funciones Convex.
6. Tras guardar env: redeploy Preview/staging y comprobar `/api/ready` = **200** (con sesión SSO si Deployment Protection está activo).
7. **No** desactivar Deployment Protection.

### UAT live (después de env)

1. Login de usuario **provisionado** → dashboard.
2. Identidad Clerk sin perfil Convex → `/acceso-denegado`, sin alta automática.
3. Mutation sensible sin JWT → UNAUTHENTICATED.
4. Usuario ministerio A no muta ministerio B.
5. Activar líder crea Clerk + Convex y permite login.

---

## 11. Cadena de verificación cruzada

| Eslabón | Resultado |
| --- | --- |
| Clerk issuer (`boss-gull-2637.clerk.accounts.dev`) | PASS en la instancia de `.env.local` |
| JWT template `convex` | PASS en esa instancia |
| Convex `CLERK_JWT_ISSUER_DOMAIN` local | PASS |
| Convex cloud staging/preview | **FAIL / UNVERIFIABLE** — no hay deployment cloud identificado |
| Vercel `NEXT_PUBLIC_CONVEX_URL` | **FAIL** en probe previo (`convexConfigured: false`); UNVERIFIABLE ahora sin `VERCEL_TOKEN` |
| Next server `getAuthenticatedConvexClient` + template `convex` | PASS en código |

**Cadena completa: BLOCKED** — el código asume la cadena; Preview no tiene Convex cloud.

---

## 12. Confirmaciones explícitas

- `main` no modificado. No hay merge a `main`.
- Production `https://multiplica-v2-cursor.vercel.app` intacta. `/api/ready` sigue `databaseConfigured` / Postgres.
- Production Branch de Vercel **no** se cambió.
- PR #23 **no mergeado**, sigue **draft**.
- No se reintrodujo Supabase como runtime.
- `getDb()` ausente en `src/modules/*` y `src/app/*`.
- No hay dual-write pastoral.
- `DATABASE_URL` no es requisito del app pastoral.

### Clasificación leftover Postgres / Drizzle / supabase

| Área | Clasificación |
| --- | --- |
| `src/db/client.ts` `getDb()` | **legacy** — no usar en app |
| `src/db/seeds/run.ts` | **seed histórico** |
| `src/db/schema/*`, `drizzle.config.ts` | **legacy** / tooling |
| `scripts/verify-phase*.ts`, `scripts/provision-e2e-users.ts` | **test / scripts históricos** (siguen pudiendo llamar `getDb`) |
| `docs/*` menciones supabase | **docs** históricas + avisos de no usar |
| Runtime `src/modules/*`, `src/app/*` | **Convex + Clerk** |

---

## 13. Operaciones cloud hechas desde esta VM

| Acción | Resultado |
| --- | --- |
| Clerk: listar JWT templates | Template `convex` presente |
| Clerk: `sign_up_mode=restricted` | **No** — keyless unclaimed no admite esa clave |
| Clerk: `restrictions.allowlist=true` | PATCH aceptado en instancia keyless; FAPI no reflejó allowlist enabled. **No** equivale a Restricted mode. No se tocó instancia production. |
| Convex cloud env | Solo local anonymous. No se cambió un deployment de producción. |
| Vercel env | No — sin `VERCEL_TOKEN` |

---

## 14. Rollback

1. Revertir `ee14978` (y este doc) en `cursor/convex-pastoral-cutover-a3cc` si hace falta.
2. No cambiar Production Branch.
3. No mergear a `main`.
4. Restaurar signup público **solo** si un humano lo pide explícitamente (no es el modelo de MULTIPLICA).

---

## 15. Enlaces

- PR: https://github.com/danielhoyos12/Multiplica-v2-Cursor/pull/23
- CI: https://github.com/danielhoyos12/Multiplica-v2-Cursor/actions/runs/31990919706
- Preview branch: https://multiplica-v2-cursor-git-cursor-convex-pasto-09e649-multiplica1.vercel.app
- Cutover: [resumen-cutover-convex-clerk.md](./resumen-cutover-convex-clerk.md)
- Auth: [clerk-auth-cutover.md](./clerk-auth-cutover.md)
- Plan Convex: [convex-full-cutover-plan.md](./convex-full-cutover-plan.md)
- Supabase removal: [supabase-removal.md](./supabase-removal.md)
