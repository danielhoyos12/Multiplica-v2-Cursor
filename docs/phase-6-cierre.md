# Fase 6 — Cierre: Capacitación Destino (Niveles 1–3)

**Resultado: PASS**  
**Branch:** `cursor/phase-6-destino-niveles-a3cc`  
**Base:** `main` (Fases 0–5 mergeadas)  
**Fecha:** 2026-08-15  
**Confirmación:** Fase 7 **NO** iniciada.

---

## 1. Resumen

Capacitación Destino se implementó **reutilizando** `training_*` + `person_process_*` de Fase 5. Tres programas secuenciales (`destino_n1|n2|n3`) con ciclos, inscripción, asistencia, recuperación, requisitos académicos vs pastorales configurables, overrides auditados y staff por ciclo. Completar un nivel **no** activa liderazgo ni crea célula.

## 2. Branch

- `cursor/phase-6-destino-niveles-a3cc`
- Tip de partida: Phase 5 merge (`65d45e5`)

## 3. Migraciones

| Artefacto | Estado |
|-----------|--------|
| `src/db/migrations/0007_serious_the_hunter.sql` | Aplicada en multiplica-dev |
| `src/db/rls/007_phase6_destination_rls.sql` | Aplicada |
| Seeds Destino + permisos | Ejecutados (`npm run db:seed`) |

Cambios DDL principales:

- Enums: `process_type` += `destino_n1|n2|n3`; `process_status` += `eligible|academic_completed`; `training_enrollment_status` += `academic_completed`
- `training_programs.level`, `training_programs.family`
- Tablas: `training_completion_requirements`, `training_cycle_staff`, `training_requirement_overrides`

## 4. Modelo Destino

- **Persona Maestra:** solo `persons.id`
- **Progreso:** `person_process_progress` por nivel (`destino_n1|n2|n3`)
- **Eventos:** `person_process_events`
- **Programa/módulos/ciclos/enrollment/asistencia:** `training_*` existentes
- **NO** se crearon `destino_nivel*_personas`

## 5. Niveles

| Código | Nombre seed | Level |
|--------|-------------|-------|
| `destino_n1` | Destino Nivel 1 | 1 |
| `destino_n2` | Destino Nivel 2 | 2 |
| `destino_n3` | Destino Nivel 3 | 3 |

Familia: `destino`. Módulos seed genéricos: M1–M4 (nombres configurables).

## 6. Elegibilidad

| Transición | Regla server-side |
|------------|-------------------|
| → N1 | UDV `completed` |
| → N2 | N1 formalmente `completed` |
| → N3 | N2 formalmente `completed` |
| Tras N3 | señal `next_level_eligible` → etapa futura (no implementada) |

Elegibilidad ≠ inscripción automática.

## 7. Ciclos

Reutiliza `training_cycles` (`planned|active|closed`). Inscripción ordinaria solo en `active`.

## 8. Módulos

Catálogo `training_modules` por programa. Sin contenido doctrinal hardcodeado.

## 9. Enrollment

`training_enrollments` único por `(cycle, person)` → permite repetición en **otro** ciclo sin borrar historial.

## 10. Asistencia

`training_attendance` por módulo: `present|absent|excused|recovered`.

## 11. Recuperación

Misma regla Fase 5: autorización explícita; fila histórica no se borra; actor + timestamp.

## 12. Requisitos académicos

Tipo seed: `manual_approval` / categoría `academic`. Acción explícita `markAcademicCompleted` → estado `academic_completed`.

## 13. Requisitos pastorales

Evaluados aparte al completar nivel. Fallo → `DESTINATION_PASTORAL_REQUIREMENT_NOT_MET`.

## 14. Regla 12 personas

- Tipo: `active_cell_members` (configurable, default 12)
- Cuenta **memberships activas** de la célula evangelística activa del participante (fallback: otra célula activa propia)
- **NO** es la métrica G12 de 12 líderes
- Sin célula → `0 / 12`
- `left` / `transferred` no cuentan

## 15. Repeticiones

Nuevo ciclo del mismo nivel conserva enrollments previos. Persona B verificada: ciclo A (bloqueado pastoral) + ciclo B (re-inscripción).

## 16. Overrides

`training_requirement_overrides` + permiso `destination.override_requirement`. Exige razón. Audita `destination.requirement_overridden`. Sin override silencioso.

## 17. Autorización

| Actor | Alcance |
|-------|---------|
| Superadmin | Global |
| Leader General | Ministerio |
| Líder | Subárbol / personas autorizadas |
| Profesor/staff ciclo | Ciclos asignados (`training_cycle_staff`) |
| Sibling / cross-ministry / anonymous | DENY |

## 18. RLS

Nuevas tablas: enable + force RLS, deny-by-default writes. Lecturas scoped / authenticated catalogs. Mutaciones vía service role.

## 19. Permisos

Nuevos: `destination.read|manage|attendance|complete_academic|complete_level|override_requirement`, `training.cycles.assign_staff`.

## 20. Auditoría

Acciones: `destination.enrolled`, `destination.academic_completed`, `destination.level_completed`, `destination.requirement_failed`, `destination.requirement_overridden`, `destination.next_level_eligible`, `school.attendance.recorded`, `school.attendance.recovery_authorized`.

## 21. UX

- `/destino` — KPIs por nivel, aptos, pendientes pastorales, ciclos
- `/destino/[cycleId]` — matriz asistencia (reusa board UDV) + académico/completar
- Persona Maestra: Escalera con N1–N3
- Célula: resumen compacto `Destino: Nivel X`
- Liderazgo / Escalera: enlaces a Destino
- Nav: Destino

## 22. Tests

- Unitarios: `destination.test.ts` + suite existente → **63 PASS**
- Live: `scripts/verify-phase6-destination.ts` → **40 / 40 PASS**

Cobertura clave: elegibilidad UDV→N1→N2; 9/12 bloquea; 12/12 permite; D sin N1 DENY; repetición; planned bloquea; recovery; override; RLS anon; no auto-liderazgo/célula.

## 23. Verificación live (multiplica-dev)

Fixtures A/B/C/D + conteo sin célula + retirados + staff + audit + secret/bundle checks: **PASS**.

## 24. Performance

Índices en requirements/staff/overrides + `training_programs(family, level)`. Board carga asistencia en batch por enrollment ids.

## 25. PASS/FAIL

| Gate | Resultado |
|------|-----------|
| lint | PASS |
| typecheck | PASS |
| test | PASS (63) |
| build | PASS |
| verify-phase6 | PASS (40/40) |
| Criterios 1–40 aceptación | PASS |
| Fase 7 no iniciada | PASS |

## 26. Warnings

- `apply-rls.sh` completo falla si políticas foundation ya existen (idempotencia parcial en 001); Phase 6 RLS se aplicó con archivo `007` directo.
- Identificadores FK largos truncados por Postgres (NOTICE) — comportamiento esperado.

## 27. Deuda técnica

- Listado aptos N1 hace N+1 de progreso (aceptable para volúmenes actuales; optimizar con anti-join si crece).
- Override UI aún no expone formulario dedicado (API/acción lista; superadmin vía servicio/verify).
- Filtros Destino en UI: nivel básico; ministerio/red/líder vía scope implícito (extender en fase reportes).
- Enum legacy `destino` (Fase 5) se mantiene como señal agregada; progreso operativo usa `destino_n*`.

## 28. Decisiones

1. Tres programas `destino_n*` con `family=destino` en lugar de un solo programa con “tracks”.
2. `academic_completed` en process + enrollment statuses.
3. Célula de conteo: preferir evangelística activa del participante.
4. Completar nivel exige `academic_completed` formal (no solo “terminó clases”).
5. Attendance reutiliza permiso UDV **o** `destination.attendance`.

## 29. Confirmación Fase 7

**NO iniciada.** Sin Escuela Ministerial, Re-Encuentro, Enviar, Classroom, materiales, certificados ni dashboard global final.

---

**Entrega:** este documento. Esperar aprobación antes de Fase 7.
