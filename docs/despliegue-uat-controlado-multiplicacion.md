# MULTIPLICA V2 — Despliegue controlado para UAT (Dev + Preview)

| Campo | Valor |
| --- | --- |
| Resultado | **ENTORNO LISTO PARA UAT MANUAL** (UAT no aprobado) |
| Fecha (UTC) | 2026-10-10 |
| Rama | `cursor/convex-pastoral-cutover-a3cc` (PR #23) |
| Commit desplegado | `8bf3c97` — Encuentro 2/3 días + cierre de brechas UAT (`86aa420` incluido) |
| Convex | Development `dev:brainy-fennec-556` / `https://brainy-fennec-556.convex.cloud` |
| Vercel Preview (autorizado) | **READY** — `https://multiplica-v2-clean-lyimtm7q1-multiplica1.vercel.app` |
| Seeds / repair / merge / Production | **No ejecutados** |

---

## 1. Confirmación del deployment Convex Dev

| Check | Resultado |
| --- | --- |
| `CONVEX_DEPLOY_KEY` prefix | `dev:brainy-fennec-556` (no `prod:`) |
| Comando | `npx convex dev --once` con `CONVEX_DEPLOYMENT=dev:brainy-fennec-556` |
| Target anunciado por CLI | `[Development] danielhoyos:multiplica-v2-clean … brainy-fennec-556` |
| Dashboard | `https://dashboard.convex.dev/d/brainy-fennec-556` |
| `health:ping` | `{ "ok": true, "message": "convex-ok" }` |
| Clerk issuer (Convex env) | `https://boss-gull-2637.clerk.accounts.dev` (Development) |

---

## 2. Cuatro tablas `multiplication*` (aditivas)

Presentes en el schema desplegado; **vacías** (0 documentos). No se eliminó ni alteró data existente.

| Tabla | Documentos |
| --- | --- |
| `multiplicationExpedientes` | 0 |
| `multiplicationContacts` | 0 |
| `multiplicationDisciples` | 0 |
| `multiplicationMilestones` | 0 |

Functions live: `getExpedienteByStudent`, `listExpedientesByMinistry`, `getExpedienteBundle`, `openExpediente`, `upsertContact`, `linkContactAsWon`, `assignDisciple`, `updateDiscipleFormation`, `upsertMilestone`.

---

## 3. URL exacta de Vercel Preview

**https://multiplica-v2-clean-lyimtm7q1-multiplica1.vercel.app**

| Evidencia | Valor |
| --- | --- |
| Proyecto autorizado | Preview – `multiplica-v2-clean` |
| SHA | `8bf3c97111e5d077c0ba482c098825f5dc8b5d43` |
| Estado GitHub | success / READY |

(También se generó Preview en `multiplica-v2-cursor`; el autorizado para UAT es **multiplica-v2-clean**.)

---

## 4. Commit desplegado

```
8bf3c97 fix(formation): Encuentro attendance follows 2- or 3-day cycle modules
86aa420 fix(uat-gaps): approval gates, group attendance, tree authz, 3-12 reports
(+ commits previos del PR #23)
```

---

## 5. Verificaciones posteriores al despliegue

### Integridad de datos (lectura; sin mutar)

| Tabla | Count |
| --- | --- |
| users | 1 |
| roles | 4 |
| ministries | 1 |
| networks | 4 |
| districts | 50 |
| persons | 1 |
| personOrganizationHistory | 1 |
| personProcessProgress | 2 |
| personProcessEvents | 2 |
| auditLogs | 5 |
| userRoleAssignments | 1 |
| trainingPrograms | 11 |
| trainingModules | 148 |
| trainingCycles | 0 |
| trainingEnrollments | 0 |
| cells | 0 |
| personLeadership | 0 |

**DATA_INTACT = true.** Persona de prueba **no reparada** (sigue `consolidar=completed` + `udv=pending` en DB).

### Pre-checks funcionales (código)

| Check | Resultado |
| --- | --- |
| Encuentro 2/3 días | PASS — `attendanceThreshold("encuentro", n)` = n; nunca exige jornada inexistente |
| Catálogo Dev Encuentro | 3 módulos activos (`DIA1`–`DIA3`); umbral actual = 3; si se desactiva `DIA3`, umbral = 2 |
| 6 líderes activos | PASS — `updateDiscipleFormation` exige `cell.status=active` + `personLeadership.status=active` |
| Preview incluye commits PR #23 | PASS (SHA `8bf3c97`) |

---

## 6. Ciclos reales y proyecciones Desafío 3 a 12

| Ítem | Estado en Dev |
| --- | --- |
| `trainingCycles` | **0** — no hay calendarios reales |
| `trainingEnrollments` | 0 |
| Expedientes multiplicación | 0 |
| Proyecciones A/B/C sobre datos reales | **No evaluables** — falta calendario/ciclos/expediente; lógica unitaria cubierta en tests (`SIN_CALENDARIO_SUFICIENTE` / cadena de dependencias) |

---

## 7. Errores o limitaciones

1. **Sin ciclos reales en Dev** → UAT de asistencia grupal y proyecciones A/B/C requiere crear ciclos/enrollments en UI (no se sembraron datos).
2. **Sin células ni personLeadership** → conteo de 6 líderes activos no puede demostrarse con datos vivos aún; la mutación lo bloquea correctamente.
3. **Preview HTML** puede exigir Vercel Authentication SSO desde esta VM (limitación conocida).
4. Catálogo Encuentro en Dev tiene 3 días activos; escenario de 2 días queda listo en código (desactivar módulo / programa de 2 módulos).

---

## 8. Production intacto

| Superficie | Evidencia |
| --- | --- |
| Convex | Solo `dev:brainy-fennec-556`; clave `dev:` (no `prod:`) |
| Vercel Production | Último Production sigue SHA `24fbb956…` (2026-09-25); este SHA solo en Preview |
| Clerk | Issuer Development `boss-gull-2637.clerk.accounts.dev` |
| Merge a `main` | No |
| Seeds / bootstrap / repair | No |

**UAT no se declara aprobado.** Entorno preparado para pruebas funcionales manuales.
