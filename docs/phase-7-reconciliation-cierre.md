# Phase 7 Reconciliation — Cierre

**Resultado: PASS**  
**Branch:** `cursor/phase-7-em-reencuentro-a3cc`  
**PR:** #9 (draft — **NO mergeado**)  
**Fecha:** 2026-08-15  
**Confirmación:** Fase 8 **NO** iniciada. Enviar **NO** implementado.

---

## 1. Motivo

La implementación técnica de Fases 5–7 era reutilizable (`training_*` / `person_process_*`), pero la **secuencia pastoral/académica** se desviaba del modelo oficial de MULTIPLICA. Había que corregirla **antes** de mergear PR #9.

## 2. Desviación detectada

Secuencia incorrecta (primera pasada Fase 7):

```
GANAR → CONSOLIDAR simplificado → UDV → DESTINO N1 → N2 → N3
→ ESCUELA MINISTERIAL (única) → RE-ENCUENTRO → ENVIAR eligible
```

## 3. Secuencia anterior (incorrecta)

- Consolidar como estado genérico previo a UDV
- UDV como gate antes de Destino
- Re-Encuentro **después** de Escuela Ministerial
- Escuela Ministerial como un solo programa

## 4. Secuencia corregida (oficial)

```
GANAR
→ CONSOLIDAR
   → PRE-ENCUENTRO (4 clases)
   → ENCUENTRO (3 días)
   → POST-ENCUENTRO (4 clases)
→ DISCIPULAR
   → Capacitación Destino 1 (Doctrina 10 + Seminario 10)
   → Capacitación Destino 2 (Doctrina 10 + Seminario 10)
   → RE-ENCUENTRO
   → Capacitación Destino 3 (Doctrina 10 + Seminario 10)
   → Escuela Ministerial 1 / 2 / 3 (cada una Doctrina 10 + Seminario 10)
→ ENVIAR [solo NEXT_STAGE_ELIGIBLE — no implementado]
```

## 5. Arquitectura preservada

Conservado sin rewrite destructivo:

- `persons` (única Persona Maestra)
- `person_process_progress` / `person_process_events`
- `training_programs` / `training_modules` / `training_cycles`
- `training_enrollments` / `training_attendance`
- `training_completion_requirements` / `training_cycle_staff` / `training_requirement_overrides`

Extensión mínima: `training_modules.component_code` / `component_name`.

## 6. Migraciones

| Artefacto | Estado |
|-----------|--------|
| `src/db/migrations/0009_phase7_reconciliation.sql` | Aplicada en multiplica-dev |
| `src/db/rls/009_phase7_reconciliation_rls.sql` | Aplicada (comentario + coverage existente) |
| Journal `_journal.json` idx 9 | Actualizado |
| `scripts/apply-rls.sh` | Incluye 009 |

DDL: `process_type` += `pre_encuentro`, `encuentro`, `post_encuentro`, `em1`, `em2`, `em3`.  
Columnas: `training_modules.component_code`, `component_name`.  
Metadata: fixtures `phase5/6/7-verify` marcados `do_not_auto_equate_to_pre_enc_post`.

## 7. Estrategia legacy

| Código | Estado |
|--------|--------|
| `udv` | DEPRECATED — no gate antes de CD1; programa `isActive=false` |
| `destino` | DEPRECATED aggregate |
| `escuela_ministerial` | DEPRECATED — reemplazado por `em1\|em2\|em3` |
| `destino_n1\|n2\|n3` | ACTIVE (códigos técnicos CD1–3) |
| `reencuentro` | ACTIVE — posición corregida (entre CD2 y CD3) |

Enums Postgres **no** se eliminaron. Filas legacy **no** se borraron.

## 8–11. Consolidar / Pre / Encuentro / Post

- Pre: 4 clases (`C1`–`C4`), códigos genéricos
- Encuentro: 3 módulos `DIA1`–`DIA3` (representación de 3 días pastorales)
- Post: 4 clases (`C1`–`C4`)
- `syncConsolidarAggregate`: Completar Pre+Enc+Post → `consolidar.completed` + evento + `ensureDestinoN1Eligible`
- No se requiere marcar Consolidar a mano si las tres etapas determinan el resultado

## 12–18. CD1 / CD2 / Re-Encuentro / CD3 / EM1–3

Elegibilidad server-side:

| Etapa | Prerrequisito |
|-------|---------------|
| CD1 | Consolidar completed |
| CD2 | CD1 completed |
| Re-Encuentro | CD2 completed |
| CD3 | CD2 + Re-Encuentro completed |
| EM1 | CD3 completed |
| EM2 | EM1 completed |
| EM3 | EM2 completed |
| NEXT_STAGE | EM3 completed → `enviar` eligible only |

## 19–20. Doctrina / Seminario / clases

Cada CD1–3 y EM1–3: componentes `doctrina` + `seminario`, 10 clases cada uno (`D01`–`D10`, `S01`–`S10`). Nombres: `Clase N` (configurables). Sin nombres doctrinales inventados.

## 21–24. Ciclos / asistencia / recuperación

- Ciclos `planned` / `active` / `closed` reutilizan `training_cycles`
- Asistencia: `training_attendance` (`present` / `absent` / `excused` / `recovered`)
- Recuperación: conserva ausencia + actor + fecha + autorización (`authorizeAttendanceRecovery`)

## 25. Elegibilidad

`eligible ≠ enrolled`. Sin inscripción automática.

## 26. Requisitos

Motor `training_completion_requirements` intacto. Requisitos `active_cell_members` (12) **desactivados** en catálogo activo por no estar confirmados por nivel. 12 personas ≠ 12 líderes G12.

## 27–28. RLS / authz

Políticas existentes cubren nuevos `process_type`. Superadmin global; LG ministry; Leader subárbol; Staff ciclos asignados; Sibling/Cross/Anonymous DENY. Permisos legacy `destination.*` / `ministerial_school.*` / `reencounter.*` conservados.

## 29. UI

- Escalera Persona Maestra: Ganar / Consolidar{Pre,Enc,Post} / Discipular{CD1,CD2,RE,CD3,EM1–3} / Enviar
- `/proceso`, `/destino`, `/reencuentro`, `/escuela-ministerial`, dashboard, liderazgo, célula (resumen compacto)
- UDV demovido a “legacy” en nav
- Rutas legacy conservadas con copy corregido

## 30. Tests

- `reconciliation.test.ts` — secuencia oficial + catálogo + integridad
- `destination.test.ts` / `phase7.test.ts` / `formation.test.ts` — corregidos (ya no validan UDV→N1 ni EM→RE)

## 31. Verificación live

`scripts/verify-phase7-reconciliation.ts` → **39/39 PASS** en multiplica-dev:

- Catálogo Pre 4 / Enc 3 / Post 4 / CD+EM 10+10
- Bloques A–F
- Happy path completo hasta NEXT_STAGE_ELIGIBLE
- Sin auto-liderazgo
- Fixtures marcados; UDV legacy preservado (12 filas)

## 32. Migración de datos

| Conjunto | Acción |
|----------|--------|
| Fixtures `phase5/6/7-verify` (63 progress) | Marcados `fixture_or_legacy_unverified` / `do_not_auto_equate_to_pre_enc_post` |
| UDV completed legacy | **NO** convertido a Pre/Enc/Post |
| Datos ambiguos | Preservados; sin historial inventado |
| Módulos Destino legacy (M1–M4) | Desactivados; reemplazados por Doctrina+Seminario oficiales |

## 33. Legacy / deprecated

Documentado en `LEGACY_PROCESS_NOTES` (`official-catalog.ts`).  
`docs/phase-7-cierre.md` marcado **SUPERSEDED BY PHASE 7 RECONCILIATION**.

## 34. Warnings

- UI EM todavía permite crear ciclo del programa legacy single-EM (compat); conteos KPI usan EM1–3
- `ministerial.ts` legacy permanece para compat RBAC/UI; flujo oficial es `em-levels.ts`
- Verify scripts Fase 5/6 históricos aún describen UDV→N1 (deuda; no gobiernan PR #9)

## 35. Deuda técnica

- Rutas dedicadas Pre/Encuentro/Post (hoy vía dominio + Escalera)
- Migrar UI EM 100% a createEmLevelCycle por nivel
- Retirar o anotar `verify-phase5/6/7` históricos
- Opcional: permisos `formation.*` unificados (no urgente)

## 36. Quality gate

| Check | Resultado |
|-------|-----------|
| lint | PASS |
| typecheck | PASS |
| tests | PASS (96) |
| build | PASS |
| verify-phase7-reconciliation | PASS (39/39) |
| RLS 009 | Aplicada |
| migration drift | 0009 aplicada; enums legacy conservados |
| Fase 8 | NO iniciada |
| PR #9 merge | NO |

## 37. Confirmación Fase 8 NO iniciada

Enviar no implementado. Solo `NEXT_STAGE_ELIGIBLE` / `next.code === "enviar"`.  
**Esperar aprobación humana antes de cualquier merge.**
