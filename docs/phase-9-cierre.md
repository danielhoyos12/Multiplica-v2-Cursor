# Phase 9 — Cierre: Dashboards / Reportes / Métricas / Alertas

## 1. Resumen

Fase 9 convierte datos operativos en información pastoral **derivada** (sin BI externo, sin contadores manuales, sin workflows pastorales nuevos).

## 2. Branch

`cursor/phase-9-dashboards-reportes-a3cc` (base `main` con Fase 8 mergeada).

## 3. Migraciones / views

Ninguna DDL nueva requerida. Volúmenes actuales (~170 personas) no justifican materialized views.  
**Decisión:** SQL agregaciones live + índices existentes.

## 4. Arquitectura reporting

```
src/modules/reporting/
  scope.ts          — Leader / LG / Superadmin
  period.ts         — períodos + thresholds
  metrics-*.ts      — personas, escalera, G12, células
  alerts.ts         — motor derivado
  integrity.ts      — system health
  reports.ts        — reportes + CSV
  dashboard.ts      — assembler ejecutivo
  csv.ts            — sanitización
```

## 5. Dashboards por rol

| Rol | Comportamiento |
|-----|----------------|
| Leader | Subárbol; drill-down a descendientes |
| LG | Ministerio(s); sin global |
| Superadmin | Global + filtros ministerio/red/raíz |

UI: `/dashboard` (URL search params compartibles).

## 6–15. Métricas

Ver `docs/reporting-metrics-definitions.md` (Personas, Ganar, Consolidar, Discipular, Enviar, G12, 12/144/1728 reales por depth, células, asistencia, transferencias).

## 16. Alert engine

Códigos: `active_leader_without_cell`, `cell_no_recent_attendance`, `cell_attendance_drop`, `leader_ready_for_twelve`, `eligible_not_activated`, `formation_stalled`, `pending_transfer`.  
No dismiss persistente. No mutación de dominio.

## 17. System health

`/admin/system-health` + `scripts/verify-data-invariants.ts` — Superadmin, read-only.

## 18–19. Reports + CSV

`/reportes` — persons/cells/leadership/formation/transfers.  
Export CSV scoped + audit `report.exported` + sanitización fórmula.

## 20–21. Permisos / RLS

Nuevos: `dashboard.read`, `reports.read`, `reports.export`, `analytics.global`, `alerts.read`.  
Consultas server-side con authz explícita (mismo patrón que Fases 2–8). Anónimo DENY vía RLS existente.

## 22. Performance

Query timings expuestos en dashboard footer. Sin cache cross-ministry.  
Materialized views: **no**. EXPLAIN no bloqueante a volúmenes actuales.

## 23. UX mobile/iPad

Cards KPI, tablas→lista en mobile, filtros GET, sin hover-only, gráficas SVG/HTML con valores textuales.

## 24–25. Tests / live

- `src/modules/reporting/reporting.test.ts`
- `scripts/verify-phase9-reporting.ts`
- `scripts/verify-data-invariants.ts`

## 26. Metric definitions

`docs/reporting-metrics-definitions.md`

## 27. PASS/FAIL

| Gate | Resultado |
|------|-----------|
| lint | **PASS** |
| typecheck | **PASS** |
| tests | **PASS** (117) |
| build | **PASS** (`/dashboard`, `/reportes`, `/admin/system-health`) |
| verify-phase9 | **PASS** (31/31) |
| verify-invariants | **PASS** (healthy, critical=0) |

## 28. Warnings

- “Nuevas personas” usa scope **current**, no atribución histórica plena por ministerio.
- Funnel = conteos actuales, no tasas de cohorte.
- Gráficas propias (sin librería pesada) — bars accesibles.
- Filtros ministry/network por UUID en UI (suficiente Fase 9; selectores amigables = deuda).

## 29. Deuda técnica

- Selectores de Ministerio/Red por nombre
- Atribución histórica fina de Ganar por ministerio-at-registration
- Acknowledgement de alertas
- Print CSS dedicado

## 30. Decisiones

1. Sin materialized views.
2. Sin chart library externa.
3. Alertas derivadas, no tabla `alerts`.
4. Integrity read-only.
5. CSV only (no XLSX).

## 31. Confirmación Fase 10 NO iniciada

**Fase 10 no iniciada.** Sin notificaciones externas, producción, warehouse, ML ni Classroom.

---

Espera aprobación humana. Sin merge automático.
