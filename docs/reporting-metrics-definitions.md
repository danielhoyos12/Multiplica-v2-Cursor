# Reporting metrics definitions (Phase 9)

All KPIs are **derived** from operational tables. No manual counter columns.

Timezone display context: **America/Lima**. Persistence remains `timestamptz`.

## Scope

| Role | Scope |
|------|--------|
| Leader | Self + `leadership_closure` descendants (`mode=subtree`) |
| Leader General | Ministerios in `user_role_assignments` / responsible (`mode=ministry`) |
| Superadmin | Global; optional ministry/network/root filters |

Drill-down: `rootPersonId` must be inside actor scope (`assertTreeAccess` / `isDescendantOf`).

---

## CURRENT STATE vs HISTORICAL ACTIVITY

| Kind | Meaning | Example |
|------|---------|---------|
| **CURRENT STATE** | Snapshot now | Persons currently in Ministry X (`person_organization_history.effective_to IS NULL`) |
| **HISTORICAL ACTIVITY** | Events in a period | Persons with `registered_at` in range, filtered by **current** scope membership |

**Phase 9 default for “nuevas personas”:** `registered_at ∈ period` ∩ person currently in scope (current org + subtree/ministry).  
This is **not** a full historical attribution by ministry at registration time. Documented limitation; not presented as cohort conversion.

If someone moved Ministerio today, their July registration still appears under **current** ministry filters when using current-state scoping — for true historical ministry attribution, a future phase would join org history overlapping `registered_at`.

---

## Person / Ganar

| KPI | Definition | Source |
|-----|------------|--------|
| Personas activas | `persons.is_active` and `deleted_at IS NULL` with current org in scope | `persons` + `person_organization_history` |
| Con / sin célula | Active membership exists / not | `cell_memberships.status=active` |
| Nuevas período | `registered_at` in period ∩ scope | `persons.registered_at` |
| Fuente | `source` public/internal counts | `persons.source` |
| Oración pendiente | Count only where prayer text non-empty | **Never** show text on dashboard |

## Escalera / Funnel

Counts are **current status** on `person_process_progress` by `process_type`.  
**Not** automatic conversion rates / cohorts.

Stages: Pre, Encuentro, Post, CD1–3, Re-Encuentro, EM1–3, Enviar.  
Statuses counted: eligible, in_progress, academic_completed, completed, paused, pending.

Enviar also joins `person_leadership` for ungidos (`eligible`) vs activados (`active`) among enviar-completed.

## Liderazgo G12

| KPI | Definition |
|-----|------------|
| active / eligible / inactive | `person_leadership.status` |
| X/12 | Direct **active** children with valid leadership cell counting rules via `getTwelveProgress` |
| Bands 0–3 / 4–7 / 8–11 / 12 | Derived visualization only — not stored |
| Depth 1/2/3 | `leadership_closure.depth` among **active** descendants |
| Potencial 12/144/1728 | Label only; UI shows **real** depth counts |

`eligible` never counts as direct active.  
`active` without open cell → **critical** alert (invariant).

## Células / asistencia

| KPI | Definition |
|-----|------------|
| Activas | `cells.status <> closed` |
| % asistencia sesión | present / active members (0 divisor → null) |
| Promedio 4 sesiones | Mean of last ≤4 session percentages |
| Tendencia | recent(2) vs baseline(next ≤4): down if recent < 0.7×baseline; up if >1.1×; else stable |
| Sin reporte | No session or last session date &gt; 7 days |

Closed cells do not generate active alerts.

## Transferencias

Pending / approved / executed-in-period / rejected-in-period / cross-ministry pending — scoped by person subtree or source/destination ministry.

## Alertas

Derived only (`computePastoralAlerts`). Never mutate domain.  
Severities: info / warning / critical.  
Thresholds: `ReportingThresholds` in `src/modules/reporting/period.ts`.

## System health

`runIntegrityChecks` — Superadmin read-only. No auto-repair.

## Export

CSV UTF-8 BOM; formula injection sanitized (`=+-@`); `report.exported` audit without file body; same scope as UI.
