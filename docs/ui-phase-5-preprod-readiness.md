# MULTIPLICA — UI Refresh Phase 5 · Pre-Production Readiness

| Campo | Valor |
| --- | --- |
| Estado | **PREPROD VALIDATION COMPLETE** — pendiente aprobación humana |
| Branch | `cursor/ui-phase-5-preprod-readiness-a3cc` |
| Base | `main` @ `e100765` (post Phase 4 / PR #16) |
| PR | (actualizar tras create) |
| Merge | **NO** |
| Producción | **NO** |
| Recomendación | **NO-GO FOR PRODUCTION** |

---

## 1. Resumen ejecutivo

Phase 5 valida readiness pre-producción: E2E autenticado por roles, export security real, negative tests de scope, visual QA autenticado, accessibility/responsive smoke, y checklist de producción.

**No** se ampliaron features ni se tocó dominio/DB/RLS/authz architecture — salvo **fixes de QA** derivados:

1. **Authz export bug:** `reports.export` era bypassed por `dashboard.read` / `persons.read` → staff podía exportar.
2. **Admin nav leak (UX):** links Admin visibles a roles que la página redirige → filtrados por permiso.
3. **DNS IPv4-first** en cliente DB + `instrumentation.ts` para mitigar `ENETUNREACH` IPv6 en redes de agent/CI.

---

## 2. Environment tested

| Item | Valor |
| --- | --- |
| Target | `multiplica-dev` Supabase (pooler `6543`) + Next local `127.0.0.1:3000` |
| Dedicated staging project | **No** provisionado |
| `APP_ENV` | local / unset (scripts refuse `production`) |
| Roles provisioned | `e2e.superadmin@…`, `e2e.lg@…`, `e2e.leader@…`, `e2e.staff@…` via `scripts/provision-e2e-users.ts` → `.env.e2e.local` (gitignored) |

---

## 3. Roles tested

| Rol | Scope esperado | Resultado |
| --- | --- | --- |
| Superadmin | global + admin + export | PASS (smoke rutas; admin flaky por DB ocasional) |
| Líder General | ministry LP1; sin System Health | PASS |
| Líder | pastoral; sin admin users/ministries | PASS |
| Staff | reports.read; **sin** export | PASS (UI sin Exportar + server deny) |

---

## 4. Authenticated E2E

Suite: `e2e/phase5-preprod.spec.ts` (+ helpers `e2e/helpers/auth.ts`)

```
npx playwright test e2e/phase5-preprod.spec.ts --project=chromium
→ 7 passed
```

Casos: Superadmin nav, LG scope, Leader deny admin, Staff no export UI, foreign personId no leak, smoke Escalera + logout, favicon.

---

## 5. Export E2E

Script: `npm run verify:phase5-export` → **PASS=8 FAIL=0**

| Caso | Resultado |
| --- | --- |
| Superadmin CSV | PASS (rows con datos) |
| Encoding / headers | PASS |
| XLSX ZIP + `multiplica-*.xlsx` | PASS |
| Print HTML (PDF vía print) sin secretos | PASS |
| Staff export denied | PASS (`REPORT_EXPORT_DENIED`) |
| LG foreign ministry query | PASS (blocked) |
| Empty-capable export | PASS |

Audit: `auditExport` sigue registrando formato en exports exitosos (código existente Phase 9).

---

## 6. Security negative tests

| Manipulación | Esperado | Resultado |
| --- | --- | --- |
| `ministerio` ajeno (LG export) | deny | PASS (script) |
| `ministerio` query staff UI | no crash / no leak | PASS (E2E) |
| `personId` / leadership fake UUID | notFound/deny, no secrets | PASS (E2E) |
| Open redirect `//evil` | neutralized | PASS (unit) |
| Staff `reports.export` | denied | PASS (fix + script + UI) |
| Admin nav without perm | hidden | PASS (unit + layout filter) |

Unit: `src/modules/security/phase5-negative.test.ts` + reporting permission assertion.

---

## 7. Visual QA

Screenshots autenticados (superadmin): `/opt/cursor/artifacts/screenshots-phase5/` (~69 PNGs)

Cobertura: login, dashboard, ganar, proceso pre/encuentro/post, destino, reencuentro, EM, células, liderazgo, transferencias, reportes, admin users/ministries, system-health, UDV — breakpoints 1440 / 1180 / 1024 / 834 / 430 / 390 / 360 (matriz completa en key surfaces; full set en 1440+390).

Observación: bajo carga puntual, algunas rutas admin mostraron error boundary por `ENETUNREACH` IPv6 hacia host directo `db.*.supabase.co` (el runtime usa pooler IPv4; flake documentado).

---

## 8. Responsive / a11y / console

- Dock + sidebar Neo Editorial intactos; sin scroll horizontal obvio en shots.
- Focus trap dialogs/sheets (Phase 4) sin regresión intencional.
- Touch `neo-touch`; status con label.
- Console: sin hydration mismatch sistemático; errores puntuales = DB connect flake.
- Favicon `/brand/app-icon.svg` servido.

---

## 9. Performance

- Build PASS; ExcelJS solo dynamic import en XLSX.
- Sin nuevas deps pesadas.
- `connect_timeout` + `ipv4first` en DB client.

---

## 10. Smoke flow (12 pasos)

Login → Dashboard → Ganar → Persona (lista) → Consolidar (?etapa) → Capacitación Destino → Células → Liderazgo → Transferencias → Reportes → Export CSV/XLSX (script SA) → Logout — **PASS** con salvedad de flake admin ocasional.

Data integrity: smoke no ejecutó approve/execute transfer ni mutaciones destructivas.

---

## 11. Bugs encontrados → fixes

| Bug | Severidad | Fix |
| --- | --- | --- |
| Export permitido vía `dashboard.read`/`persons.read` sin `reports.export` | **Critical authz** | `assertReportsAccess(exportMode)` exige `reports.export`; UI `canExport` solo ese permiso |
| Admin links visibles sin permiso | Medium UX | `filterSecondaryGroups` + layout pasa flags |
| ENETUNREACH IPv6 en agent | Medium env | `dns.setDefaultResultOrder('ipv4first')` en `db/client` + `instrumentation.ts` |

---

## 12. Quality gates

| Gate | Resultado |
| --- | --- |
| lint | PASS |
| typecheck | PASS |
| test | PASS — 146 |
| build | PASS |
| verify:phase5-export | PASS 8/8 |
| playwright phase5 chromium | PASS 7/7 |

---

## 13. Production readiness checklist

| Ítem | Estado |
| --- | --- |
| Env vars documentadas (`.env.example`) | OK |
| Supabase **prod** project separado | **PENDING** |
| Vercel prod env | **PENDING** |
| Auth callback / Site URLs staging+prod | **PENDING** |
| Migrations 0000–0010 + RLS | Code ready; prod apply **PENDING** |
| Seed prod = catalogs only | Documented; **PENDING** |
| Superadmin bootstrap strategy | Documented |
| Backup / rollback | Ver `docs/deployment-rollback.md` |
| Monitoring / error logging | Basic; expand **PENDING** |
| Staging smoke owner sign-off | **PENDING** |
| UAT humana | **PENDING** |

Referencias: `docs/go-live-checklist.md`, `docs/release-readiness.md`, `docs/deployment-rollback.md`.

---

## 14. Blockers → NO-GO

1. **No hay proyecto staging dedicado** — validación corrió contra `multiplica-dev`.
2. **UAT humana / owner approval** no firmada.
3. **Env producción** (Vercel + Supabase prod + Auth URLs + SMTP) no configurada en este run.
4. **Flake de conectividad DB** (IPv6 direct host) aún puede afectar páginas pesadas bajo carga — mitigado parcialmente; validar en staging real con red estable.
5. E2E autenticado staff/leader **persona 360 con árbol real** limitado (leader E2E sin `personId` link completo).

---

## 15. GO / NO-GO

### **NO-GO FOR PRODUCTION**

**Razones:** staging dedicado + UAT humana + env prod siguen pendientes; checklist go-live incompleta. Código y validación preprod en dev **sí** avanzan el estado a **CODE_READY + PREPROD_VALIDATED_ON_DEV**.

**Sí permitido tras aprobación humana:** merge de este PR a `main` (fixes + harness E2E + docs). **No** deploy producción.

---

## 16. No-regresión

Dominio / DB / migraciones / RLS / auth model / rutas / Escalera / workflows: **intactos**. Cambios limitados a authz export gate, nav filter, DNS/client hardening, tests y docs.

Copy: **Capacitación Destino**; Reportes ≠ paso Escalera.

---

## 17. Cómo reproducir

```bash
npm run e2e:provision          # escribe .env.e2e.local
npm run verify:phase5-export
npm run dev -- --hostname 127.0.0.1 --port 3000
set -a && source .env.e2e.local && set +a
npx playwright test e2e/phase5-preprod.spec.ts --project=chromium
node scripts/ui-phase5-screenshots.mjs
```

---

**Esperar aprobación humana. No merge. No producción.**
