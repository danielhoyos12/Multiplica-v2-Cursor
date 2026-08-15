# reporting (Phase 9)

Derived pastoral dashboards, alerts, operational reports, and system-health checks.

- **No manual counters.** All KPIs come from existing domain tables.
- **No BI warehouse / ETL.** SQL aggregations in `src/modules/reporting/`.
- **Scope:** Leader subtree · LG ministry · Superadmin global.
- **Alerts** are derived information only — they never mutate leadership/process/cells.
- **Integrity** checks are read-only (`runIntegrityChecks` / `/admin/system-health`).

See `docs/reporting-metrics-definitions.md` and `docs/phase-9-cierre.md`.
