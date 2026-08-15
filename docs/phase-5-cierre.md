# Fase 5 — Cierre: Escalera del Éxito / Consolidar / Universidad de la Vida

## 1. Resumen

Se implementó la primera parte formal de la Escalera del Éxito sobre Persona Maestra (Fases 0–4):

- **Consolidar** (inicio / pausa / retoma / completar)
- **Universidad de la Vida** (ciclos, módulos configurables, inscripción, asistencia, recuperación, completar)
- Progreso reutilizable (`person_process_*` + `training_*`) sin silos de personas
- Completar UDV habilita señal `eligible_for_destination` / `NEXT_STAGE_ELIGIBLE` **sin** activar liderazgo

**Fase 6 NO iniciada.**

## 2. Branch

`cursor/phase-5-escalera-udv-a3cc` (base: `main` con Fases 0–4 mergeadas)

## 3. Migraciones

| Archivo | multiplica-dev |
|---|---|
| `src/db/migrations/0006_youthful_mastermind.sql` | Aplicada |
| `src/db/rls/006_phase5_formation_rls.sql` | Aplicada |
| Seeds permisos process/udv/school + catálogo UDV | `npm run db:seed` |

## 4. Modelo de proceso

- `person_process_progress` — una fila por `(person_id, process_type)` (`consolidar` \| `udv` \| `destino`)
- `person_process_events` — historial append-only
- Solo referencia `persons.id` (sin copiar nombre/teléfono/Ministerio)

## 5. Consolidar

Estados: `pending` \| `in_progress` \| `completed` \| `paused` \| `abandoned`

Operaciones: iniciar, pausar, retomar, completar (idempotente si ya completed).

Completar → crea/asegura fila UDV `pending` (apto).

## 6. Universidad de la Vida

Requisito server-side: Consolidar `completed`.

Estados progreso: `pending` (apto) → `in_progress` → `completed` / `paused`.

## 7. Ciclos

`training_cycles`: `planned` \| `active` \| `closed`

Inscripción ordinaria solo en ciclo `active`.

## 8. Módulos

`training_programs` + `training_modules` configurables.

Seed UDV: M1–M4 (nombres genéricos; sin contenido doctrinal inventado).

## 9. Inscripciones

`training_enrollments` — unique `(cycle_id, person_id)`.

## 10. Asistencia

`training_attendance` — unique `(enrollment_id, module_id)`.

Estados: `present` \| `absent` \| `excused` \| `recovered`.

## 11. Recuperación

Ausencia histórica **no se borra**. Operación explícita autoriza `recovered` + actor/fecha/nota + auditoría.

## 12. Reglas de completado

Completado UDV = acción explícita de actor autorizado (sin % doctrinal automático).

Registrar `completed_by_user_id`.

## 13. Autorización

Scope: Superadmin global · Leader General ministerio · Líder subárbol / assigned / miembros de sus células.

Sibling / cross-ministry: DENY (`PROCESS_ACCESS_DENIED` / `CROSS_MINISTRY_PROCESS_DENIED`).

## 14. RLS

Deny-by-default + SELECT scoped vía helpers Phase 4 (`is_leadership_descendant`, `is_leader_general_for_ministry`).

Anonymous: DENY.

Mutaciones vía servicios server-side.

## 15. Permisos

`process.read|update`, `consolidation.manage`, `udv.read|manage|attendance`, `school.cycles.manage`, `school.catalog.manage` (superadmin).

## 16. Auditoría

`process.consolidation.started|completed|paused`, `process.udv.enrolled|completed|paused`, `school.cycle.created|activated`, `school.attendance.recorded`, `school.attendance.recovery_authorized`.

## 17. UX

- `/proceso` — resumen + listado filtrable
- `/udv`, `/udv/[cycleId]` — ciclos + asistencia mobile-first
- Persona Maestra: Escalera real + acciones Consolidar
- Célula: resumen Consolidar/UDV por miembro
- Dashboard líder: KPIs de proceso

## 18. Tests

`src/modules/formation/formation.test.ts` + suite total **50 PASS**.

## 19. Verificación live

`scripts/verify-phase5-formation.ts` — **29 PASS / 0 FAIL**

Incluye: consolidar→UDV, deny sin prerrequisito, dup enrollment, asistencia+recuperación, completar sin activar líder, cross-ministry deny, anon DENY, auditoría.

## 20. Performance

Índices en person/process/status/ministry/assigned leader/cycle/enrollment/module.

Listados sin N+1 obvio en board (attendance batch).

## 21. PASS / FAIL

| Gate | Resultado |
|---|---|
| lint | PASS (warnings menores limpios) |
| typecheck | PASS |
| tests | PASS (50) |
| build | PASS |
| verify-phase5 | PASS (29) |
| Fase 6 no iniciada | PASS |

**Cierre Fase 5: PASS** (pendiente aprobación)

## 22. Warnings

- Inscripción UI acepta UUID de persona (búsqueda avanzada = deuda)
- Completar UDV no valida automáticamente todos los módulos (política explícita conservadora)
- Destino solo como señal `pending` / metadata

## 23. Deuda técnica

- Capacitación Destino / EM / Re-Encuentro / Classroom
- Override especial post-cierre de ciclo
- Catálogo UI admin de módulos
- Filtro por Red/líder más rico en Escalera

## 24. Decisiones

1. Progreso genérico + training genérico (no tablas `consolidar_personas` / `udv_personas`)
2. Completar UDV ≠ activar líder (Fase 4 intacta)
3. Recuperación no borra ausencia
4. Próxima etapa derivable (`destino` pending + metadata)

## 25. Confirmación Fase 6

**Fase 6 NO inició.** Fuera de alcance: Destino, Niveles EM, Re-Encuentro, Classroom, materiales, certificados, Enviar completo, transferencias ministeriales, dashboard global final.
