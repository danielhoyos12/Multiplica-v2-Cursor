# Reporte de cierre — Fase 1 MULTIPLICA

**Branch:** `cursor/phase-1-organizacion-a3cc`  
**Fecha:** 2026-08-14  
**Base:** Fase 0 cerrada (multiplica-dev)  
**Fase 2:** no iniciada

## Resumen

Se implementó la base organizacional y de autorización:

- Superadmin funcional (rol + permisos + UI admin)
- CRUD de Ministerios Generales (no hardcodeados; UUID PK + código humano)
- Redes con reglas de compatibilidad; Niños sigue desactivado
- Usuarios vinculados a `auth.users`, roles/scopes, asignación de `leader_general`
- `canView` / `canMutate` + `loadAuthContext` con aislamiento por Ministerio
- Servicio de códigos humanos (`LP1`, `LP1-01`, `LP1-03-01`) preparado
- Auditoría de cambios administrativos
- RLS scoped por Ministerio (ALLOW/DENY verificado en vivo)
- UI admin responsive: Ministerios, Redes, Usuarios

## Migraciones aplicadas

| Artefacto | Contenido | Estado remoto |
| --- | --- | --- |
| `src/db/migrations/0001_confused_gargoyle.sql` | `ministries.responsible_user_id` + FK + index | Aplicada vía SQL versionado |
| `src/db/rls/002_phase1_ministry_rls.sql` | helpers `is_superadmin`, `user_ministry_ids` + policies scoped | Aplicada vía SQL versionado |
| Seed idempotente `npm run db:seed` | permisos Phase 1 (9 total) | Ejecutado; **no** seedea nombres de ministerios |

No se re-aplicó la foundation 0000 ni se duplicaron seeds de distritos/redes de forma destructiva.

## Tablas modificadas

- `ministries` — columna nueva `responsible_user_id` (FK → `users`, ON DELETE SET NULL)
- `permissions` / `role_permissions` — nuevos códigos de permiso (seed)
- `user_role_assignments` — usada para scope `leader_general` + `ministry_id`
- `audit_logs` — escrituras de administración
- `users` — ensure profile on login

Sin tablas pastorales nuevas (células, ganar, etc.).

## Policies RLS

Helpers:

- `public.is_superadmin()`
- `public.user_ministry_ids()`

Policies Phase 1:

- `ministries_select_scoped` (reemplaza select amplio)
- `users_select_self_or_superadmin`
- `user_role_assignments_select_self_or_superadmin`
- `audit_logs_select_superadmin`

Deny-by-default se mantiene en `persons` / `person_organization_history` (y inserts sin policy en ministries para no-superadmin).

## Archivos principales

- Schema/migrations/RLS: `src/db/schema/foundation.ts`, `0001_confused_gargoyle.sql`, `002_phase1_ministry_rls.sql`
- Authz: `src/modules/authorization/policy.ts`, `context.ts`
- Organization: `src/modules/organization/service.ts`, `src/server/actions/organization.ts`
- Human codes: `src/lib/human-codes.ts`
- UI: `src/app/(app)/admin/ministries/**`, `networks`, `users`
- Seeds: `src/db/seeds/permissions.ts`
- Tests: `src/modules/authorization/policy.test.ts`

## Pruebas ejecutadas

| Comando / prueba | Resultado |
| --- | --- |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` (5) | PASS |
| `npm run build` | PASS |
| Bundle scan service_role / DATABASE_URL values in `.next/static` | PASS (0 leaks) |
| RLS ALLOW superadmin ve LP1+LP2 | PASS |
| RLS DENY leader_general solo ve LP1 | PASS |
| RLS DENY leader_general insert ministry | PASS |
| PostgREST leader audit count = 0 | PASS |
| PostgREST superadmin audit readable | PASS |
| Service layer create/update/activate/assign + audit actions | PASS |
| Niños `is_active=false` | PASS |

## Warnings

- Next.js 16: convención `middleware` deprecada → `proxy` (no bloqueante)
- `DATABASE_URL` directo `db.*:5432` sigue siendo IPv6-only desde este agente; pooler requerido para ops
- Nombre `SUPABASE_SERVICE_ROLE_KEY` puede aparecer en chunk client por módulo env compartido (valor ausente)

## Deuda técnica

1. Separar `src/lib/env.ts` público/servidor
2. Migrar middleware → proxy
3. Registrar migraciones aplicadas también en `supabase_migrations` si se unifica el pipeline CLI
4. UI de asignación de roles genérica (hoy: responsable LG desde detalle de ministerio)
5. Tree scope / códigos humanos aún sin generación automática de árbol

## Decisiones

1. Ministerios **no** seedeados: Superadmin los crea (LP1/LP2/LP3 de verificación son de prueba)
2. Mutaciones admin vía server services + Drizzle tras `assertCanMutate`; RLS aísla lecturas PostgREST
3. `responsible_user_id` + `user_role_assignments(leader_general, ministry_id)` juntos para LG
4. Códigos humanos validados (`^[A-Za-z0-9]+$`) pero nunca PK
5. Niños: sin gestión de otras redes; permanece inactivo

## Criterios de aceptación

1. Superadmin puede administrar Ministerios — **PASS**
2. Ministerios no hardcodeados — **PASS**
3. Redes con reglas correctas — **PASS**
4. Niños desactivado — **PASS**
5. `leader_general` asignable a un Ministerio — **PASS**
6. `leader_general` no accede a otro Ministerio — **PASS** (RLS + policy)
7. Permisos validados server-side — **PASS**
8. RLS ALLOW/DENY correctos — **PASS**
9. Auditoría de cambios admin — **PASS**
10. `service_role` no en bundles cliente — **PASS** (valores)
11. Migraciones versionadas en Git — **PASS**
12. Sin workflows pastorales fuera de alcance — **PASS**

## Veredicto

**Fase 1 CERRADA con PASS.** Detenido. No se inicia Fase 2.
