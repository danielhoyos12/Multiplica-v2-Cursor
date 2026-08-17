# MULTIPLICA — Resumen completo: cutover Convex + Clerk

| Campo | Valor |
| --- | --- |
| Fecha | 2026-08-17 |
| Producto | Pastoral Escalera (GANAR → CONSOLIDAR → DISCIPULAR → ENVIAR) |
| Repo | `danielhoyos12/Multiplica-v2-Cursor` |
| Base de merge | `staging` |
| Autor de este resumen | Cloud Agent (sesión Convex + Clerk) |

Este documento cubre **todo lo pedido en esta sesión** (y el trabajo de cutover asociado): Convex local, Clerk, quitar Supabase, fixes de deploy/sign-up, merge, cutover pastoral Drizzle → Convex, y el inventario de cambios.

---

## 1. Lo que pediste (hilo de trabajo)

1. Configurar Convex en local.
2. Preferir Convex sobre Supabase/Drizzle (tipado + realtime).
3. Pasar autenticación a **Clerk**.
4. Quitar Supabase por completo (Auth y producto).
5. Seguir [convex.dev/agent-setup.md](https://www.convex.dev/agent-setup.md).
6. Keys Clerk locales + JWT issuer para Convex / previews Vercel.
7. Limpiar leftovers de Supabase y asegurar Clerk + Convex.
8. Commit / push.
9. **No** migrar data de Supabase (no había data útil; revertir cualquier import).
10. Pregunta sobre el sistema de UI (ShadCN vs custom).
11. Fix de build Vercel: prerender `/convex-dev` sin `ConvexProvider`.
12. Push de nuevo.
13. Fix de sign-up (página rota).
14. Push de nuevo.
15. Sign-up seguía roto → segundo arreglo (loop de redirects).
16. Aprobación → marcar PR listo.
17. Merge del PR.
18. Resumen de cómo se hizo la migración.
19. Completar el cutover pastoral (`getDb()` / Drizzle → Convex).
20. Resumen completo en un archivo `.md` (este documento).

---

## 2. Stack resultante

| Capa | Antes | Ahora |
| --- | --- | --- |
| App | Next.js 16 App Router + React 19 + TypeScript | Igual |
| UI | Tailwind v4 + kit **Neo Editorial** propio (`src/components/ui`) | Igual — **no es ShadCN** (no hay Radix/`shadcn`) |
| Auth | Supabase Auth + cookies + RLS | **Clerk** (`@clerk/nextjs`) |
| Datos pastorales | Postgres (Supabase) + Drizzle + RLS | **Convex** (queries/mutations) |
| Realtime | — | Convex subscriptions (infra lista) |
| Deploy | Vercel + Supabase | Vercel + Clerk + Convex |

---

## 3. Pull requests

| PR | Título | Base | Estado |
| --- | --- | --- | --- |
| [#20](https://github.com/danielhoyos12/Multiplica-v2-Cursor/pull/20) | feat(convex): local spike + FULL_CUTOVER phase 0 | `staging` | **MERGED** |
| [#21](https://github.com/danielhoyos12/Multiplica-v2-Cursor/pull/21) | feat(auth): replace Supabase Auth with Clerk | `staging` | **MERGED** |
| [#22](https://github.com/danielhoyos12/Multiplica-v2-Cursor/pull/22) | feat(backend): remove Supabase; Clerk auth + Convex data plane | `staging` | **MERGED** `130dcec` (2026-08-17 00:54 UTC) |
| [#23](https://github.com/danielhoyos12/Multiplica-v2-Cursor/pull/23) | feat(convex): pastoral FULL_CUTOVER — modules off Drizzle onto Convex | `staging` | **OPEN** (pendiente de merge) |

El merge de #22 absorbió el trabajo de #20 y #21 en `staging`.

---

## 4. Fase A — Convex local (PR #20)

- Dependencia `convex` + scripts `convex:dev` / `convex:once` / `convex:dashboard` (`CONVEX_AGENT_MODE=anonymous`).
- Schema foundation inicial (`convex/schema.ts`).
- Smoke: `convex/health.ts`, `/convex-dev`, indicador websocket verde/rojo.
- Docs: `docs/convex-local-dev.md`, plan de cutover.
- Tooling agente: skills Convex, MCP (`npx convex mcp start`), `npx convex ai-files install`.

**Pendiente humano (Cursor Desktop):** plugin Convex + reload; confirmar MCP sano.

---

## 5. Fase B — Clerk Auth (PR #21 → #22)

### Qué cambió

| Área | Cambio |
| --- | --- |
| SDK | `@clerk/nextjs` |
| Middleware | `clerkMiddleware` + password-gate cookie |
| Login / recuperar | `useSignIn` (Clerk) |
| Sesión | `auth()` / `currentUser()` → perfil app vía `authSubject` / `clerk_user_id` |
| Provision líderes | `clerkClient().users.createUser` |
| Password gate | `must_change_password` + `publicMetadata` + cookie |
| UI | `ClerkAuthControls` (SignIn/SignUp/UserButton) |
| Matcher | `/__clerk/:path*` |

### Identidad

- App `users._id` (Convex) = id interno para authz.
- `users.authSubject` = Clerk `user_…`.
- Migración Postgres histórica `0011_clerk_user_id.sql` (legacy; runtime ya no depende de ella).

### App Clerk

- Target: `app_3I0zc3YzaXVrDXUXSnaqXDfwzjj`
- Instancia JWT: `https://boss-gull-2637.clerk.accounts.dev`
- `clerk auth login` / `clerk init` **no se completó en la VM** (OAuth de navegador).

---

## 6. Fase C — Quitar Supabase (PR #22)

### Eliminado

- Paquetes `@supabase/ssr`, `@supabase/supabase-js`
- Clientes `src/server/supabase/*`
- Env `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`
- MCP Supabase en `.cursor/mcp.json`
- Skills `.agents/skills/supabase*`
- Verify/provision ya no hablan con Auth/PostgREST de Supabase
- Runtime **rechaza** `DATABASE_URL` en `*.supabase.co` / `*.supabase.com`

### Bridge Clerk ↔ Convex

- `convex/auth.config.ts` con `CLERK_JWT_ISSUER_DOMAIN`
- Cliente: `ConvexProviderWithClerk` + `useAuth` de Clerk
- JWT template Clerk **debe llamarse `convex`** (paso en Dashboard)

### Data de Supabase

Se **empezó** un import Postgres → Convex y se **revirtió por pedido explícito** (no había data productiva). Nada de eso quedó committed.

---

## 7. Correcciones pedidas después (también en #22)

### 7.1 Build Vercel — `/convex-dev`

**Error:** `useQuery` fuera de `ConvexProvider` en prerender (sin `NEXT_PUBLIC_CONVEX_URL`).

**Fix:**

- URL de Convex pasada desde el layout server (placeholder en `MULTIPLICA_ALLOW_PLACEHOLDER_ENV=1`)
- `/convex-dev` `force-dynamic`
- Panel de health solo monta hooks si hay URL

Commit: `3f64b1c`

### 7.2 Sign-up roto (1.er arreglo)

**Causa:** `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/login` — no había UI de SignUp; Clerk a menudo espera `/sign-up`.

**Fix:** página `/sign-up` + env `/sign-up` + link desde login.

Commits: `25bfe0b`, `e7947c2`

### 7.3 Sign-up roto (2.º arreglo — loop)

**Causa real:** tras crear cuenta → `/dashboard` → no hay perfil app (sin DB interim) → layout manda a `/login` → middleware manda otra vez a `/dashboard` = **redirect loop** (página “rota”).

**Fix:**

- **Crear cuenta** abre **modal** Clerk
- `/sign-up` con routing `hash`
- Post-signup a **`/bienvenida`** (funciona sin Postgres)
- Layout: si hay sesión Clerk pero no perfil Convex → `/bienvenida`, no `/login`
- Middleware no rebota `/bienvenida` al dashboard

Commit: `d35c6f9`

### 7.4 Aprobación y merge

- PR #22 marcado **ready for review**
- Merge a `staging`: commit `130dcec` (2026-08-17 00:54 UTC)

---

## 8. Fase D — Cutover pastoral Drizzle → Convex (PR #23, abierto)

Esto responde a: *“Los módulos pastorales siguen usando `getDb()`…”*.

### Criterio de salida

- **Cero** `getDb()` en `src/modules/*` y `src/app/*`
- `getDb()` solo en `src/db/client.ts` (helper legacy) y `src/db/seeds/run.ts` (seed Postgres histórico)

Verificación: `npm run typecheck` OK · **161 tests** OK.

### Schema Convex (tablas pastorales)

Foundation: `districts`, `networks`, `ministries`, `persons`, `users`, `roles`, `permissions`, `rolePermissions`, `userRoleAssignments`, `personOrganizationHistory`, `auditLogs`, `personIntakeEvents`

Células: `cells`, `cellMemberships`, `cellAttendanceSessions`, `cellAttendance`

Liderazgo: `personLeadership`, `leadershipClosure`

Formación: `personProcessProgress`, `personProcessEvents`, `trainingPrograms`, `trainingModules`, `trainingCycles`, `trainingEnrollments`, `trainingAttendance`, `trainingCompletionRequirements`, `trainingCycleStaff`, `trainingRequirementOverrides`

Transferencias: `pastoralTransferRequests`, `leadershipRelationshipHistory`, `cellLeadershipHistory`

Plus: `healthChecks` (smoke).

### Módulos Convex nuevos / ampliados

| Archivo | Rol |
| --- | --- |
| `convex/users.ts` | Perfil app (`ensureProfile`, password gate, activo) |
| `convex/authz.ts` | `loadContext`, assignRole, superadmin |
| `convex/organization.ts` | Ministerios / redes / usuarios / assignments |
| `convex/seed.ts` | Catálogos idempotentes (`seedCatalogs`) |
| `convex/persons.ts` | Ganar / Persona Maestra |
| `convex/cells.ts` | Células, membresías, asistencia |
| `convex/leadership.ts` | Eligible / activate / deactivate / closure G12 |
| `convex/formation.ts` | Escalera, ciclos, enrollments, attendance |
| `convex/transfers.ts` | Solicitudes pastorales |
| `convex/send.ts` | Enviar / ungimiento |
| `convex/reporting.ts` | Snapshots KPIs + integrity |
| `convex/audit.ts` | Audit log |
| `convex/lib/*` | `now()`, errores, ids |

### Servicios Next reescritos (ya no Drizzle)

- `src/server/auth.ts`, `src/modules/authorization/context.ts`
- `src/modules/organization/service.ts`, `src/modules/audit/logger.ts`
- `src/modules/ganar/service.ts`
- `src/modules/cells/service.ts`
- `src/modules/leadership/service.ts` + `password-actions.ts` (Clerk `createUser` sigue en Next)
- `src/modules/formation/*` (service, consolidar, destino, EM, reencuentro, catalog)
- `src/modules/transfers/service.ts`, `src/modules/send/service.ts`
- `src/modules/reporting/*` (dashboard, metrics, alerts, reports, integrity)
- Páginas: layout app, dashboard, ganar/[id], transferencias, auth/callback

### Seed Convex

```bash
npm run convex:dev
npm run db:seed:convex   # scripts/seed-convex.ts
npm run dev
```

### IDs

Convex document ids **no son UUID**. Validadores Zod de entidades pasaron de `z.string().uuid()` a `z.string().min(1)` en los módulos tocados.

---

## 9. Variables de entorno

```bash
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# Convex (app)
NEXT_PUBLIC_CONVEX_URL=
NEXT_PUBLIC_CONVEX_SITE_URL=

# Convex deployment (Dashboard, no por preview Vercel)
CLERK_JWT_ISSUER_DOMAIN=https://boss-gull-2637.clerk.accounts.dev
# CONVEX_DEPLOY_KEY=   # deploys cloud / Vercel

# Opcional — NO *.supabase.co
# DATABASE_URL=   # solo seed legacy Postgres
```

**Vercel:** Clerk keys + `NEXT_PUBLIC_CONVEX_URL` (+ deploy key).  
**Convex Dashboard:** `CLERK_JWT_ISSUER_DOMAIN` una vez en defaults Preview/Dev.  
**Clerk Dashboard:** JWT template nombrado **`convex`**.

---

## 10. UI (respuesta a la pregunta)

No es ShadCN. Es:

- Next.js App Router + Tailwind CSS v4
- Kit propio en `src/components/ui/` (`Button`, `PageHeader`, `DataTable`, etc.)
- Tokens **Neo Editorial** (`globals.css`, `public/brand/tokens*`: rice, ink, cobalt, vermilion)

---

## 11. Commits relevantes (orden cronológico)

### Convex spike + Clerk + quitar Supabase (merged en #22)

1. `chore(convex): add dependency and local npm scripts`
2. Convex MCP / schema / `/convex-dev` / indicador WS / docs
3. Clerk SDK, `clerk_user_id`, middleware, login/recovery, provision, docs, UI controls
4. Quitar SDK Supabase; Convex data plane; AI files MCP
5. `fix(auth): finish Clerk↔Convex bridge and purge Supabase leftovers`
6. `fix(build): stop /convex-dev prerender crash without ConvexProvider`
7. Sign-up `/sign-up` + docs
8. `fix(auth): make sign-up work without broken redirect loop`
9. Merge #22 → `staging` (`130dcec`)

### Cutover pastoral (PR #23)

1. `feat(convex): full pastoral data plane schema + lib helpers`
2. `feat(convex): add users, authz, seed, and organization modules`
3. `feat(convex): cut over auth + organization server layer to Convex`
4. `feat(convex): persons, cells, leadership modules`
5. Formation / transfers / send modules + cutover de servicios
6. `feat(pastoral): cut over ganar/cells/leadership services to Convex`
7. Cutover formation / ministerial / transfers / send
8. Reporting Convex + páginas dashboard/transferencias
9. Docs: plan FULL_CUTOVER + README

---

## 12. Qué NO quedó hecho / riesgos

| Ítem | Estado |
| --- | --- |
| Merge de **PR #23** a `staging` | Pendiente (tú apruebas) |
| Plugin Convex en Cursor Desktop | Paso humano |
| `clerk init` CLI en la VM | Bloqueado (OAuth browser) |
| JWT template `convex` en Clerk Dashboard | Paso humano |
| `CLERK_JWT_ISSUER_DOMAIN` en Convex cloud | Paso humano |
| `NEXT_PUBLIC_CONVEX_URL` en Vercel | Paso humano |
| UAT staging / producción | No aprobado |
| Import masivo de data Supabase | **Cancelado a propósito** |
| Dual-write Drizzle+Convex | No: un writer (Convex) en runtime pastoral |
| Seed histórico Postgres (`db:seed`) | Legacy; usar `db:seed:convex` |

Reporting ahora agrega en JS sobre snapshots Convex (no SQL Postgres). Con volúmenes grandes puede hacer falta optimizar con indexes/aggregates nativos.

---

## 13. Cómo operar localmente

```bash
cp .env.example .env.local   # Clerk + Convex
npm ci
npm run convex:dev           # terminal 1 — :3210
npm run db:seed:convex       # catálogos RBAC / redes / distritos
npm run dev                  # terminal 2
```

Rutas útiles:

- Login: `/login`
- Sign-up: `/sign-up` o modal **Crear cuenta**
- Post-signup: `/bienvenida`
- Smoke Convex: `/convex-dev`

---

## 14. Documentos relacionados en el repo

- [docs/convex-full-cutover-plan.md](./convex-full-cutover-plan.md)
- [docs/supabase-removal.md](./supabase-removal.md)
- [docs/clerk-auth-cutover.md](./clerk-auth-cutover.md)
- [docs/convex-local-dev.md](./convex-local-dev.md)
- [README.md](../README.md)

---

**STATUS:** Clerk + Convex en `staging` (PR #22 merged). Cutover pastoral de código en PR #23 (abierto). Este archivo es el inventario de la sesión.
