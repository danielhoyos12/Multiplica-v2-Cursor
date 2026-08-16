# MULTIPLICA — UI Refresh Phase 4 · Reporte de entrega

**Deep UX + Hardening + Final Polish**

| Campo | Valor |
| --- | --- |
| Estado | **UI PHASE 4 READY** — pendiente aprobación humana |
| Branch | `cursor/ui-phase-4-deep-ux-hardening-a3cc` |
| Base | `main` (post PR #15) |
| PR | (actualizar) |
| Merge | **NO** |
| Producción | **NO** |

---

## 1. Resumen ejecutivo

Phase 4 cierra deuda profunda de UX: Persona 360°, liderazgo drill-down, confirmaciones móviles de transferencias, seguridad de exportación, favicon oficial, deep-link Consolidar `?etapa=`, polish UDV Legacy — **sin cambios de dominio, DB, RLS, authz, rutas ni workflows**.

---

## 2–4. Branch / PR / Commits

Ver HEAD en branch. Base merge PR #15 (`9d4bf57`).

---

## 5. Archivos modificados / nuevos (principales)

### Persona 360°
- `src/app/(app)/ganar/[id]/page.tsx` — secciones colapsables, nav sticky, pendientes, Escalera 01–04 con Capacitación Destino

### Liderazgo
- `src/app/(app)/liderazgo/[personId]/page.tsx` — breadcrumbs, Volver, KpiCard/ProgressBar, cards Gen+1

### Transferencias mobile
- `src/components/ui/bottom-sheet.tsx` — nuevo (focus trap + Escape)
- `src/components/ui/confirm-dialog.tsx` — Escape + focus
- `src/components/transfers/transfer-confirm-button.tsx` — desktop dialog / mobile sheet
- `src/app/(app)/transferencias/page.tsx` — acciones con confirmación

### Export security
- `src/modules/reporting/phase4-security.test.ts`
- `src/components/reporting/export-menu.tsx` — copy denegación
- `e2e/phase4-hardening.spec.ts`

### Favicon
- `src/app/layout.tsx` — `icons` → `/brand/app-icon.svg`

### Consolidar deep-link
- `src/components/formation/proceso-etapa-focus.tsx`
- `src/app/(app)/proceso/page.tsx` — `?etapa=pre|encuentro|post`

### UDV
- `src/app/(app)/udv/page.tsx` — Neo Editorial + badge Legacy

### UI
- `src/components/ui/collapsible-section.tsx`

---

## 6. Persona 360°

Organiza Identidad, Pertenencia, Liderazgo, Escalera (Consolidar / Capacitación Destino / Re-Encuentro / EM / Enviar), Historial, Pendientes y Acciones existentes. Sin campos inventados. Responsive: grid 2 col desktop, 1 col + collapsible mobile.

---

## 7. Liderazgo drill-down

Breadcrumbs scroll-x, Volver un nivel, KPIs compartidos, ProgressBar 0/12→12/12, células, generación +1 en cards. Sin organigrama horizontal.

---

## 8. Mobile confirmations

Approve / Reject / Execute → ConfirmDialog (≥640px) o BottomSheet (&lt;640px). Focus trap, Escape, copy de contexto persona/tipo/razón. Lógica de aprobación intacta.

---

## 9. Export security tests

- Unit: staff sin `reports.export`, leader con export, empty CSV humano, print HTML sin secretos, xlsx ZIP signature, etapa query validation
- E2E: rutas reportes/transferencias/liderazgo → login anónimo; app-icon SVG servido
- Menú Exportar: mensaje explícito si `REPORT_EXPORT_DENIED`
- Manual documentado: forzar ministerio ajeno por query sigue scoped server-side (`resolveDashboardScope`)

---

## 10. Favicon / app icon

`metadata.icons` / apple / shortcut → `public/brand/app-icon.svg` (geometría oficial, sin reinterpretar).

---

## 11. Proceso deep-link

`/proceso?etapa=pre|encuentro|post` focaliza sección (scroll + ring). Valor inválido → ignore (fallback seguro). Sin rutas nuevas.

---

## 12. UDV Legacy polish

DataCard, InlineNotice, EmptyState, badge Legacy, CTA vermilion. Sin ampliar funcionalidad.

---

## 13–14. Accessibility / Responsive

Focus trap sheets/dialogs, Escape, aria-expanded collapsibles, touch `neo-touch`, print CSS previa. Breakpoints objetivo 1440–360.

---

## 15. Performance

ExcelJS solo vía dynamic import en export XLSX (ya Phase 3). BottomSheet/ConfirmDialog client-only en transferencias. Sin nuevas deps pesadas en Phase 4.

---

## 16. Security audit

- Export sigue `assertReportsAccess(..., exportMode)`
- Persona detalle / liderazgo usan servicios con notFound en NOT_AUTHORIZED / TREE_ACCESS_DENIED
- Transfer actions server-side con permisos existentes
- UI no es única barrera

---

## 17–20. Quality gates

| Gate | Resultado |
| --- | --- |
| lint | PASS |
| typecheck | PASS |
| test | PASS (unit + Phase 4 security) |
| build | PASS |
| e2e | Suite existe; smoke + phase4-hardening (requiere server; CI puede `PLAYWRIGHT_SKIP=1`) |

Warnings: middleware→proxy preexistente.

---

## 21. Screenshots

Recomendado en preview Vercel del PR: Persona 360 (desktop/mobile), liderazgo drill-down, transfer BottomSheet, proceso?etapa=, UDV, 1440/834/390.

---

## 22. Deuda restante

- PDF binario nativo (sigue print-to-PDF)
- E2E autenticado con credenciales seed (export denial staff)
- FormSection en todos los formularios legacy
- Árbol liderazgo multi-nivel expand/collapse sin navegación
- Deep-link Discipular stages

---

## 23. No-regresión

- Persona Maestra / DB / RLS / authz / roles / scopes intactos
- Escalera / liderazgo / formación / células / transferencias / reporting / rutas intactos
- Copy: **Capacitación Destino**; Reportes ≠ paso Escalera

---

**Esperar aprobación humana. No merge. No producción.**
