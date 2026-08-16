# MULTIPLICA — UI Refresh Phase 4 · Reporte de entrega

**Deep UX + Hardening + Final Polish**

| Campo | Valor |
| --- | --- |
| Estado | **UI PHASE 4 READY** — pendiente aprobación humana |
| Branch | `cursor/ui-phase-4-deep-ux-hardening-a3cc` |
| Base | `main` @ `9d4bf57` (post PR #15) |
| PR | https://github.com/danielhoyos12/Multiplica-v2-Cursor/pull/16 |
| Commits | `c88995e` feat(ui): Phase 4 deep UX hardening and polish · `af6da19` fix(a11y): full focus trap on ConfirmDialog |
| Merge | **NO** |
| Producción | **NO** |

---

## 1. Resumen ejecutivo

Phase 4 cierra deuda profunda de UX: Persona 360°, liderazgo drill-down, confirmaciones móviles de transferencias, seguridad de exportación, favicon oficial, deep-link Consolidar `?etapa=`, polish UDV Legacy — **sin cambios de dominio, DB, RLS, authz, rutas ni workflows**.

---

## 2. Branch / PR / Commits

- Branch nueva desde `main` (requisito de cloud: sufijo `-a3cc`).
- PR draft **#16** — espera aprobación humana. **No mergear.**

---

## 3. Archivos modificados / nuevos

### Persona 360°
- `src/app/(app)/ganar/[id]/page.tsx` — secciones colapsables, nav sticky, pendientes, Escalera 01–04 con Capacitación Destino

### Liderazgo
- `src/app/(app)/liderazgo/[personId]/page.tsx` — breadcrumbs, Volver, KpiCard/ProgressBar, cards Gen+1

### Transferencias mobile
- `src/components/ui/bottom-sheet.tsx` — nuevo (focus trap + Escape)
- `src/components/ui/confirm-dialog.tsx` — Escape + focus trap completo
- `src/components/transfers/transfer-confirm-button.tsx` — desktop dialog / mobile sheet
- `src/app/(app)/transferencias/page.tsx` — acciones con confirmación

### Export security
- `src/modules/reporting/phase4-security.test.ts`
- `src/components/reporting/export-menu.tsx` — copy denegación
- `e2e/phase4-hardening.spec.ts`

### Favicon
- `src/app/layout.tsx` — `icons` / apple / shortcut → `/brand/app-icon.svg`

### Consolidar deep-link
- `src/components/formation/proceso-etapa-focus.tsx`
- `src/app/(app)/proceso/page.tsx` — `?etapa=pre|encuentro|post`

### UDV
- `src/app/(app)/udv/page.tsx` — Neo Editorial + badge Legacy

### UI
- `src/components/ui/collapsible-section.tsx`

### Docs
- `docs/ui-phase-4-entrega.md` (este archivo)

**Diff vs main:** 15 files, +1203 / −361

---

## 4. Persona 360°

Organiza Identidad, Pertenencia, Liderazgo, Escalera (Consolidar / Capacitación Destino / Re-Encuentro / EM / Enviar), Historial, Pendientes y Acciones existentes. Sin campos inventados ni fuentes de verdad paralelas. Responsive: grid 2 col desktop, 1 col + collapsible mobile.

---

## 5. Liderazgo drill-down

Breadcrumbs scroll-x, Volver un nivel, KPIs compartidos, ProgressBar 0/12→12/12, células, generación +1 en cards. Sin organigrama horizontal infinito. Preserva eligible ≠ active, raíz ministerial, direct_leader.

---

## 6. Mobile confirmations

Approve / Reject / Execute → ConfirmDialog (≥768px) o BottomSheet (&lt;768px). Focus trap, Escape, restore focus, copy de contexto persona/tipo/razón. Lógica de aprobación intacta (mismas server actions).

---

## 7. Export security tests

- Unit: staff sin `reports.export`, leader con export, empty CSV humano, print HTML sin secretos, xlsx ZIP signature, etapa query validation
- E2E: rutas reportes/transferencias/liderazgo → login anónimo; app-icon SVG servido
- Menú Exportar: mensaje explícito si `REPORT_EXPORT_DENIED`
- Server-side: exports siguen `assertReportsAccess` / scope — UI no es única barrera
- Manual documentado: forzar ministerio ajeno por query sigue scoped server-side (`resolveDashboardScope`)
- **No** service role bypass en tests

---

## 8. Favicon / app icon

`metadata.icons` / apple / shortcut → `public/brand/app-icon.svg` (geometría oficial, sin reinterpretar). `applicationName: MULTIPLICA`.

---

## 9. Proceso deep-link

`/proceso?etapa=pre|encuentro|post` focaliza sección (scroll + ring). Valor inválido → ignore (fallback seguro). Sin rutas nuevas. URLs compartibles.

---

## 10. UDV Legacy polish

DataCard, InlineNotice, EmptyState, badge Legacy, CTA vermilion. Tipografía/spacing/status Neo. Sin ampliar funcionalidad legacy.

---

## 11. Component / copy audit

- Botones / dialogs / sheets / empty / badges alineados a tokens Neo
- Copy oficial: 01 Ganar · 02 Consolidar · 03 Discipular · 04 Enviar · 05 Reportes
- Consolidar: Pre-Encuentro / Encuentro / Post-Encuentro
- Discipular: **Capacitación Destino** (nunca “Destino” solo) / Re-Encuentro / Escuela Ministerial
- Enviar: Células / Liderazgo / Transferencias
- Reportes ≠ quinto paso de la Escalera

---

## 12. Accessibility

Focus trap sheets/dialogs, Escape, aria-modal, aria-labelledby, aria-expanded collapsibles, touch `neo-touch` ≥44px, labels de denegación export, status badges con texto (no solo color).

---

## 13. Responsive

Breakpoints objetivo: 1440 / 1180 / 1024 / 834 / 430 / 390 / 360. Rutas críticas listadas en brief. Sin scroll horizontal en drill-down (stack vertical + breadcrumb). Dock/sidebar pattern de Phase 1–3 intacto.

**Screenshots automatizados:** no generados en este entorno (rutas app requieren auth). Validar en preview del PR: Persona 360, liderazgo, transfer BottomSheet, proceso?etapa=, UDV, 1440/834/390.

---

## 14. Performance

- ExcelJS solo vía dynamic import en export XLSX (Phase 3)
- BottomSheet / ConfirmDialog / TransferConfirmButton client-only en transferencias
- Sin nuevas dependencias npm en Phase 4
- Bundle: sin impacto material adicional

---

## 15. Security audit

| Superficie | Control |
| --- | --- |
| Export | `assertReportsAccess(..., exportMode)` + scope |
| Persona detalle | servicios + notFound en NOT_AUTHORIZED |
| Liderazgo | TREE_ACCESS_DENIED / notFound |
| Transferencias | server actions con permisos existentes |
| Query params | no amplían scope (solo UI focus / filtros server-scoped) |

UI nunca es la única barrera.

---

## 16. Quality gates

| Gate | Resultado |
| --- | --- |
| `npm run lint` | **PASS** |
| `npm run typecheck` | **PASS** |
| `npm test` | **PASS** — 12 files / 138 tests |
| `npm run build` | **PASS** |
| E2E | Suite `e2e/phase4-hardening.spec.ts` (requiere server; CI puede `PLAYWRIGHT_SKIP=1`) |

Warnings preexistentes: middleware→proxy naming (Next).

---

## 17. Pruebas manuales documentadas (sin credenciales seed en agent)

1. Abrir Persona detalle → revisar secciones / collapsibles / CTAs vermilion
2. Liderazgo → breadcrumb → drill Gen+1 → Volver
3. Transferencias mobile → BottomSheet approve/reject; desktop ConfirmDialog
4. `/proceso?etapa=pre|encuentro|post` y `?etapa=foo` (fallback)
5. Favicon en tab browser
6. Staff sin export → denegación; leader export OK
7. Export vacío → mensaje humano
8. UDV desktop/mobile polish
9. Breakpoints 1440 / 834 / 390 en rutas críticas

---

## 18. Deuda restante

- PDF binario nativo (sigue print-to-PDF)
- E2E autenticado con credenciales seed (export denial staff end-to-end)
- FormSection en todos los formularios legacy
- Árbol liderazgo multi-nivel expand/collapse sin navegación de página
- Deep-link Discipular stages
- Screenshots Visual QA en preview autenticado

---

## 19. No-regresión (explícito)

| Área | Estado |
| --- | --- |
| Persona Maestra | intacta |
| DB / migraciones | intactas |
| RLS | intacto |
| Auth / authz | intacto |
| Roles / scopes | intactos |
| Escalera | intacta |
| Liderazgo (lógica) | intacta |
| Formación | intacta |
| Células | intactas |
| Transferencias (lógica) | intactas |
| Reporting | intacto |
| Rutas | intactas |

---

## 20. Cierre

**Esperar aprobación humana. No merge. No producción.**
