# Fase 3 — Cierre Células / Membresías / Horarios / Asistencia

## 1. Resumen

Se implementó el **núcleo operativo de células** sobre la Persona Maestra de GANAR:

- Crear/editar células (evangelística / de 12)
- Horario (día + hora + `America/Lima`)
- Ministerio y Red obligatorios
- Miembros desde `persons` (sin duplicar datos)
- Historial de membresías (retirar / reasignar)
- Asistencia semanal mobile-first
- Aislamiento por Ministerio + RLS
- Conversión a Célula de 12 **bloqueada** con error de dominio preparado

**Fase 4 NO iniciada** (sin activación de líderes, sin árbol G12/12/144/1728).

## 2. Branch

`cursor/phase-3-celulas-a3cc` (base: `main` con Fases 0–2 mergeadas)

## 3. Migraciones

| Archivo | multiplica-dev |
|---|---|
| `src/db/migrations/0003_lethal_cloak.sql` | Aplicada |
| `src/db/rls/004_phase3_cells_rls.sql` | Aplicada |
| Seeds permisos `cells.*` | Aplicados vía `npm run db:seed` |

## 4. Tablas nuevas/modificadas

**Nuevas**

- `cells`
- `cell_memberships`
- `cell_attendance_sessions`
- `cell_attendance`

**Sin cambios estructurales en `persons`** — la compatibilidad de Red usa la pertenencia actual en `person_organization_history`.

## 5. Modelo cells

- UUID PK + `code` humano opcional
- `type`: `evangelistic` | `twelve`
- `ministry_id`, `network_id` obligatorios
- `responsible_person_id` → Persona Maestra (Phase 3)
- `responsible_user_id` → placeholder para activación/auth (Phase 4)
- `day_of_week` enum + `start_time` time + `timezone` default `America/Lima`
- `status`: active | inactive | closed
- `opened_at` / `closed_at`

Restricción preparada: máx. 2 células directas no cerradas por responsable (1 por tipo).

## 6. Modelo memberships

- `cell_id` + `person_id`
- `status`: active | left | transferred
- `joined_at` / `left_at` / `leave_reason`
- Una sola membresía **activa** por persona (evita ambigüedad)
- Retiro/reasignación cierran fila y abren nueva (historial intacto)
- Persona Maestra nunca se borra

## 7. Modelo attendance

- Sesión por `cell_id` + `session_date` (unique)
- Filas `present` | `absent` | `excused`
- Upsert por persona/sesión
- Auditoría agregada `cell.attendance.recorded` (conteos, sin spam por persona)

## 8. RLS

Policies SELECT scoped por `ministry_id` / join a `cells`:

- `cells_select_scoped`
- `cell_memberships_select_scoped`
- `cell_attendance_sessions_select_scoped`
- `cell_attendance_select_scoped`

Anonymous: DENY (sin policies de escritura; SELECT vacío/error).

Mutaciones: solo server services.

## 9. Authz

- Resource type `cell` en `canView` / `canMutate`
- Scope Ministerio (Superadmin global; `leader_general` scoped)
- Árbol G12 no inventado

## 10. Permisos

Nuevos: `cells.read`, `cells.create`, `cells.update`, `cells.manage_members`, `cells.attendance`

Asignados a superadmin / leader_general / leader / staff según mapa RBAC.

## 11. Auditoría

- `cell.created` / `cell.updated` / `cell.closed`
- `cell.member.added` / `removed` / `reassigned`
- `cell.attendance.session.created` / `cell.attendance.recorded`

## 12. UX

- `/celulas` listado + stats + filtros (mobile cards)
- `/celulas/nueva`
- `/celulas/[id]` detalle + miembros + cierre protegido
- `/celulas/[id]/asistencia` toma rápida Presente/Ausente/Justificado
- Enlace “Registrar primero en GANAR”
- Sin selector de creación de persona desde célula
- Paginación GANAR ahora preserva query params (deuda Phase 2)

## 13. Tests

`src/modules/cells/cells.test.ts` (+ suites previas): **29 tests PASS**

Cubre validación, schedule UI, compatibilidad Red, authz, conversión no implementada.

Live: `scripts/verify-phase3-cells.ts` — **19/19 PASS**.

## 14. Verificación live

Contra multiplica-dev:

- Células en Ministerios A y B
- Memberships, reasignación con historial
- Cierre bloqueado con miembros activos
- Asistencia persistida
- Leader B no ve célula A
- Superadmin ve ambas
- Anon DENY
- Niños bloqueado
- Sin secretos en `.next/static`

## 15. Criterios PASS/FAIL

| # | Criterio | Resultado |
|---|---|---|
| 1–5 | Crear célula, horario, ministerio/red, Niños bloqueado | PASS |
| 6–10 | Miembros desde GANAR, sin duplicar, historial, retiro, reasignación | PASS |
| 11–13 | Asistencia semanal, mobile UX, stats | PASS |
| 14–18 | Aislamiento, superadmin, anon deny, RLS, authz | PASS |
| 19 | Cierre con miembros activos bloqueado | PASS |
| 20 | Célula de 12 preparada sin falsear líderes | PASS |
| 21–25 | Secretos / lint / typecheck / tests / build | PASS |
| 26 | Fase 4 no iniciada | PASS |

## 16. Warnings

- Next.js middleware→proxy advisory (cosmético).
- UX de responsable usa UUID de persona (placeholder hasta búsqueda pastoral Fase 4).
- Compatibilidad de miembros basada en Red organizacional actual, no en sexo biológico (no se infiere género por nombre).

## 17. Deuda técnica

- Tokens/atribución pastoral y activación de líderes (Fase 4).
- Validación completa de composición de Célula de 12.
- Propagación jerárquica de asistencia hacia arriba.
- Transferencias cross-ministry.
- Mejor picker de responsable (búsqueda GANAR).

## 18. Decisiones

1. Compatibilidad Red = pertenencia abierta en `person_organization_history`.
2. Máx. 1 membresía activa por persona en Phase 3.
3. Célula de 12: creación solo Superadmin; conversión lanza `CELL_CONVERSION_PREREQUISITES_NOT_IMPLEMENTED`.
4. `responsible_person_id` operativo; `responsible_user_id` preparado.
5. Cerrar célula exige cero miembros activos.

## 19. Confirmación Fase 4

**Fase 4 NO fue iniciada.** No hay activación de líderes, credenciales automáticas, árbol 12/144/1728, navegación generacional ni conversión pastoral real.
