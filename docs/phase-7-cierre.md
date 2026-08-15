# Fase 7 — Cierre: Escuela Ministerial + Re-Encuentro

**Resultado: PASS**  
**Branch:** `cursor/phase-7-em-reencuentro-a3cc`  
**Base:** `main` (Fases 0–6 mergeadas; tip `077fbba`)  
**Fecha:** 2026-08-15  
**Confirmación:** Fase 8 **NO** iniciada.

---

## 1. Resumen

Escuela Ministerial y Re-Encuentro se implementaron **reutilizando** `training_*` + `person_process_*`. Sin silos de personas. Completar cualquiera de las dos etapas **no** activa liderazgo, no abre célula y no genera credenciales. Al completar Re-Encuentro solo se marca elegibilidad para Enviar (`eligible_for_send` / `NEXT_STAGE_ELIGIBLE`).

## 2. Branch

- `cursor/phase-7-em-reencuentro-a3cc`

## 3. Migraciones

| Artefacto | Estado |
|-----------|--------|
| `src/db/migrations/0008_phase7_em_reencuentro.sql` | Aplicada en multiplica-dev |
| `src/db/rls/008_phase7_em_reencuentro_rls.sql` | Aplicada (comentario + coverage existente) |
| Seeds EM + Re-Encuentro + permisos | Ejecutados |

DDL: `process_type` += `escuela_ministerial`, `reencuentro`. **Sin tablas nuevas de personas.**

## 4. Escuela Ministerial

- Programa `escuela_ministerial` (`family: ministerial`)
- Módulos seed: `EM-M1`…`EM-M4` (nombres genéricos configurables)
- Requisito seed: `manual_approval` académico
- Prerrequisito: Destino N3 `completed`
- Estados: `eligible` / `in_progress` / `academic_completed` / `completed` / `paused`
- UI: `/escuela-ministerial`, `/escuela-ministerial/[cycleId]`

## 5. Re-Encuentro

- Programa `reencuentro` (`family: reencuentro`)
- **Decisión:** evento único modelado como ciclo `training_cycles` + módulo `RE-EVENT`
- Asistencia: present/absent/excused/recovered sobre ese módulo
- Prerrequisito: EM `completed`
- Completar → `eligible_for_send` (Enviar no implementado)
- UI: `/reencuentro`, `/reencuentro/[cycleId]`

## 6. Elegibilidad

| Transición | Regla |
|------------|--------|
| → EM | Destino N3 completed |
| → Re-Encuentro | EM completed |
| Tras Re-Encuentro | señal Enviar (solo elegibilidad) |

Elegibilidad ≠ inscripción automática.

## 7. Programas

`training_programs`: `escuela_ministerial`, `reencuentro`.

## 8. Ciclos

Reutiliza `training_cycles` (`planned|active|closed`). Inscripción ordinaria solo en `active`.

## 9. Módulos

Configurables vía `training_modules`. Re-Encuentro: un módulo de evento (documentado).

## 10. Enrollments

`training_enrollments` unique `(cycle_id, person_id)` → repetición en otro ciclo/evento conserva historial.

## 11. Asistencia

`training_attendance` + permisos `ministerial_school.attendance` / `reencounter.attendance`.

## 12. Recuperación

Misma regla Fase 5/6 (autorización; no borrar fila).

## 13. Requisitos

`training_completion_requirements` + overrides existentes. EM seed: solo academic manual approval.

## 14. Repeticiones

Verificado: Persona D ausente en evento 1, re-inscrita en evento 2; enrollments distintos.

## 15. Autorización

Superadmin global · LG ministerio · Líder subárbol · Staff ciclo · Sibling/cross-ministry/anon DENY.

## 16. RLS

Sin tablas nuevas. Policies Fase 5/6 sobre `person_process_*` / `training_*` aplican a nuevos `process_type`. Deny-by-default writes.

## 17. Permisos

`ministerial_school.read|manage|attendance|complete`  
`reencounter.read|manage|attendance|complete`

## 18. Auditoría

`ministerial_school.enrolled|paused|resumed|academic_completed|completed|next_stage_eligible`  
`reencounter.enrolled|attendance_recorded|completed|next_stage_eligible`

## 19. Persona Maestra / Escalera

GANAR → Consolidar → UDV → Destino N1–N3 → Escuela Ministerial → Re-Encuentro → Enviar (apto, no implementado).

## 20. UX

- Nav: Escuela Min. / Re-Encuentro
- Célula: resumen compacto EM / Re-Encuentro
- Liderazgo: KPIs EM + Re-Encuentro scoped
- Mobile/iPad-first (listas + acciones rápidas)

## 21. Tests

- Unitarios `phase7.test.ts` + suite → **76 PASS**
- Live `scripts/verify-phase7-ministerial-reencounter.ts` → **36 / 36 PASS**

## 22. Verificación live

Fixtures A/B/C/D: elegibilidad, ciclos, attendance, complete, no auto-liderazgo/célula, repetición, audit, anon, drift, secrets — **PASS**.

## 23. Performance

Sin tablas nuevas; índices existentes por program/cycle/person/status. Boards cargan asistencia en batch.

## 24. PASS/FAIL

| Gate | Resultado |
|------|-----------|
| lint | PASS |
| typecheck | PASS |
| test | PASS (76) |
| build | PASS |
| verify-phase7 | PASS (36/36) |
| Criterios 1–41 | PASS |
| Fase 8 no iniciada | PASS |

## 25. Warnings

- Verify seedear progreso Destino vía fixtures DB (no re-ejecuta todo el pipeline pastoral 0–6 por persona) para enfocarse en EM/RE.
- `apply-rls.sh` completo sigue no-idempotente en foundation (mismo aviso Fase 6).

## 26. Deuda técnica

- Override UI dedicada EM aún no expuesta (API/servicio listos).
- Filtros ministerio/red/líder en listados EM/RE: scope implícito; UI de filtros avanzada pendiente.
- Enviar / transferencias: fuera de alcance (Fase 8+).

## 27. Decisiones

1. Re-Encuentro = programa `training_*` con módulo único `RE-EVENT` (no LMS, no calendario complejo).
2. Completar EM habilita Re-Encuentro vía `ensureReencuentroEligible`.
3. Completar Destino N3 habilita EM vía `ensureEmEligible`.
4. Completar Re-Encuentro solo marca `eligible_for_send` — **no** implementa Enviar.

## 28. Confirmación Fase 8

**NO iniciada.** Sin Enviar, transferencias, Classroom, certificados, dashboard global final ni producción.

---

**Entrega:** este documento. Esperar aprobación antes de Fase 8.
