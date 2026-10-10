# MULTIPLICA V2 — Verificación de conexión Convex

| Campo | Valor |
| --- | --- |
| Fecha (UTC) | 2026-09-24 |
| Repositorio | `danielhoyos12/Multiplica-v2-Cursor` |
| Rama de trabajo | `cursor/convex-pastoral-cutover-a3cc` |
| Proyecto Convex esperado | `multiplica-v2-clean` |
| Deployment esperado | `brainy-fennec-556` |
| Tipo esperado | Development Cloud |
| Modo de esta verificación | **READ-ONLY** (sin deploy, sin mutations, sin seeds, sin cambios de env) |
| Resultado | **PASS** |

---

## Veredicto

**PASS** — `CONVEX_DEPLOY_KEY` está cargada, apunta exactamente al deployment Development `brainy-fennec-556`, no coincide con deployments previos documentados, la base cloud está vacía y el repositorio tiene esquema + funciones listos para el primer push.

La clave **no** se imprime aquí (ni fragmentos del secreto).

---

## Checklist de verificación

| # | Comprobación | Resultado | Evidencia (sin secretos) |
| --- | --- | --- | --- |
| 1 | `CONVEX_DEPLOY_KEY` cargada | **PASS** | Presente en el entorno del agente (`length=78`). No se volcó el valor. |
| 2 | Deployment exacto `brainy-fennec-556` + tipo Development | **PASS** | Prefijo no secreto de la key: `dev:brainy-fennec-556`. CLI: `npx convex data` → *«There are no tables in the brainy-fennec-556 deployment's database.»*; `npx convex env list --names-only` → *«No environment variables set (on **dev** deployment brainy-fennec-556)»*; `npx convex function-spec` → `url: https://brainy-fennec-556.convex.cloud`. |
| 3 | No apunta al proyecto/deployment anterior | **PASS** | Prefijo ≠ `merry-kookaburra-415`, ≠ `anonymous-agent`, ≠ `anonymous-local`. Tipo `dev:` (no `prod:`, no `preview:`). |
| 4 | Esquema y funciones del repositorio disponibles | **PASS (repo)** / **PENDING (cloud)** | Repo: `convex/schema.ts` con **32** tablas; **147** exports `query`/`mutation`/`internalMutation` en 14 módulos. Cloud: `function-spec.functions = []` y sin tablas — esperado antes del primer despliegue. |
| 5 | Variables Clerk necesarias antes del primer deploy | **IDENTIFICADAS** | Ver sección siguiente. |
| 6 | Base de datos nueva vacía | **PASS** | `npx convex data` confirma cero tablas en `brainy-fennec-556`. |
| 7 | Sin deploys / mutations / seeds / edits de env | **CUMPLIDO** | Solo lecturas CLI (`data`, `function-spec`, `env list --names-only`). Sin `--prod`. |
| 8 | Sin `--prod` ni credenciales Production | **CUMPLIDO** | Key `dev:…`; ningún flag `--prod`. |

### Nota sobre el nombre de proyecto

El nombre de deployment y el tipo Development están confirmados por CLI. El slug de proyecto `multiplica-v2-clean` **no** se pudo re-leer vía Convex MCP en esta sesión (`Not Authorized` sin `npx convex login` interactivo). La key deployment-scoped `dev:brainy-fennec-556` fija el target al deployment declarado; no se usó `--deployment` ni `--prod`.

---

## Estado actual del deployment cloud

| Aspecto | Estado |
| --- | --- |
| URL | `https://brainy-fennec-556.convex.cloud` |
| Tipo | Development (`dev:`) |
| Tablas | Ninguna |
| Funciones desplegadas | Ninguna (`functions: []`) |
| Env vars en Convex | Ninguna |

---

## Inventario en el repositorio (listo para push)

### Esquema — 32 tablas

`healthChecks`, `districts`, `networks`, `ministries`, `persons`, `users`, `roles`, `permissions`, `rolePermissions`, `userRoleAssignments`, `personOrganizationHistory`, `auditLogs`, `personIntakeEvents`, `cells`, `cellMemberships`, `cellAttendanceSessions`, `cellAttendance`, `personLeadership`, `leadershipClosure`, `personProcessProgress`, `personProcessEvents`, `trainingPrograms`, `trainingModules`, `trainingCycles`, `trainingEnrollments`, `trainingAttendance`, `trainingCompletionRequirements`, `trainingCycleStaff`, `trainingRequirementOverrides`, `pastoralTransferRequests`, `leadershipRelationshipHistory`, `cellLeadershipHistory`

### Funciones Convex — 147 exports

| Tipo | Cantidad |
| --- | --- |
| `query` | 88 |
| `mutation` | 56 |
| `internalMutation` | 3 |
| `action` / `internalAction` / `internalQuery` | 0 |

Módulos: `health`, `users`, `authz`, `organization`, `foundation`, `persons`, `cells`, `leadership`, `formation`, `transfers`, `send`, `reporting`, `audit`, `seed`.

Auth bridge: `convex/auth.config.ts` → proveedor Clerk con `domain: process.env.CLERK_JWT_ISSUER_DOMAIN`, `applicationID: "convex"`.

---

## Variables Clerk necesarias antes del primer despliegue

### En el deployment Convex (`brainy-fennec-556`) — obligatorio para auth JWT

| Variable | Dónde | Notas |
| --- | --- | --- |
| `CLERK_JWT_ISSUER_DOMAIN` | Convex Dashboard → Settings → Environment Variables **o** `npx convex env set` **sin** `--prod` | Ej. documentado en el repo: `https://boss-gull-2637.clerk.accounts.dev` (usar el issuer real de la instancia Clerk del equipo). Hoy: **no está set** en este deployment. |

Además en Clerk Dashboard (no es env de Convex, pero es prerequisito):

1. JWT Template con nombre exacto **`convex`** (`aud` = `convex`).
2. Instancia Clerk alineada con las keys de la app Next.

### En la app Next.js / Vercel / Cloud Agents (runtime)

| Variable | Rol |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Cliente Clerk |
| `CLERK_SECRET_KEY` | Server Clerk (provision, `clerkClient`) |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/login` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/login` (signup público cerrado) |
| `NEXT_PUBLIC_APP_URL` | URL pública de la app |
| `NEXT_PUBLIC_CONVEX_URL` | Tras el push: `https://brainy-fennec-556.convex.cloud` |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | Opcional (HTTP actions / site) |
| `CONVEX_DEPLOY_KEY` | Ya cargada para agentes/CI (key `dev:brainy-fennec-556`) |

Fuente: `.env.example`, `docs/clerk-auth-cutover.md`, `convex/auth.config.ts`.

---

## Pasos exactos pendientes para el primer despliegue (Development)

> No ejecutados en esta verificación. Orden recomendado. **Nunca** usar `--prod` ni una key `prod:`.

### 1. Confirmar Clerk (humano / Dashboard)

1. Clerk → JWT Templates → existe plantilla **`convex`**.
2. Anotar el Frontend API URL / issuer (`https://<instance>.clerk.accounts.dev`).

### 2. Setear env en Convex Dev (aún sin push de código)

```bash
# Con CONVEX_DEPLOY_KEY=dev:brainy-fennec-556 ya exportada
npx convex env set CLERK_JWT_ISSUER_DOMAIN 'https://<instance>.clerk.accounts.dev'
# Verificar solo nombres (no imprime valores sensibles de más):
npx convex env list --names-only
```

No usar `--prod`. No usar `--deployment` junto a una deployment-scoped key.

### 3. Primer push de esquema + funciones al Development cloud

```bash
# Preferido para Development (evita ambigüedad con production deploy)
npx convex dev --once
```

Esto debe crear las 32 tablas y registrar las funciones en `https://brainy-fennec-556.convex.cloud`.

Post-check read-only:

```bash
npx convex data
npx convex function-spec | head
npx convex run health:ping   # solo si se autoriza una query de lectura post-deploy
```

### 4. Cablear la app al nuevo deployment

En `.env.local` / Vercel Preview / Cloud Agents (según entorno):

```bash
NEXT_PUBLIC_CONVEX_URL=https://brainy-fennec-556.convex.cloud
# + keys Clerk ya listadas arriba
```

### 5. Smoke de conexión (después del push)

1. Arrancar Next con esas env.
2. Hit `/api/ready` → `clerkConfigured`, `convexConfigured`, `convexReachable`.
3. UI: indicador Convex + `health.ping`.

### 6. Datos (opcional, **después** del push — fuera de esta verificación)

Solo cuando un humano lo autorice explícitamente:

- Catálogos / bootstrap vía `seed` **internal** (p. ej. `seed:seedCatalogs` / flujo preview documentado).
- **No** seedear Production.
- Esta verificación **no** ejecutó seeds.

---

## Criterio de stop (cumplido)

| Condición de stop | ¿Aplica? |
| --- | --- |
| Clave no disponible | No — presente |
| Deployment no coincide exactamente | No — `brainy-fennec-556` exacto |
| Tipo no Development | No — `dev:` + mensaje CLI «dev deployment» |

Por tanto se completó el informe en lugar de detenerse en bloqueo.

---

## Resumen ejecutivo

| Ítem | Estado |
| --- | --- |
| Conexión key → `brainy-fennec-556` (Development) | **PASS** |
| Aislamiento vs deployment anterior | **PASS** |
| DB cloud vacía | **PASS** |
| Código Convex en repo | **PASS** (32 tablas, 147 funciones) |
| Código Convex en cloud | **PENDIENTE** (primer `convex dev --once`) |
| `CLERK_JWT_ISSUER_DOMAIN` en Convex | **PENDIENTE** |
| JWT template Clerk `convex` | **PENDIENTE de confirmar en Dashboard** |
| `NEXT_PUBLIC_CONVEX_URL` apuntando al cloud nuevo | **PENDIENTE** |

**Siguiente acción humana recomendada:** setear `CLERK_JWT_ISSUER_DOMAIN` en `brainy-fennec-556`, luego `npx convex dev --once` (sin `--prod`), luego actualizar `NEXT_PUBLIC_CONVEX_URL`.
