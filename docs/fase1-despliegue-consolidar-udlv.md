# MULTIPLICA V2 — FASE 1: Despliegue controlado Consolidar / UDLV

| Campo | Valor |
| --- | --- |
| Resultado | **FASE 1 COMPLETADA** |
| Fecha (UTC) | 2026-10-08 |
| Rama | `cursor/convex-pastoral-cutover-a3cc` |
| Commit | `0a54a67` — `fix(formation): Consolidar equals UDLV stages before Destino unlock` |
| Convex | Development `brainy-fennec-556` / `https://brainy-fennec-556.convex.cloud` |
| Vercel Preview (autorizado) | **READY** — `https://multiplica-v2-clean-lj0h378bt-multiplica1.vercel.app` |
| Repair / seeds / merge / Production | **No ejecutados** |

---

## 1. Verificaciones previas

| Check | Resultado |
| --- | --- |
| Rama autorizada | PASS |
| Key `dev:brainy-fennec-556` | PASS |
| Diff solo Consolidar/UDLV (+ docs/tests relacionados) | PASS (excluidos docs de auditoría/ganar ajenos) |
| `tsc --noEmit` | PASS |
| `npm run lint` | PASS |
| Vitest regresión | **105** tests PASS |
| `npm run build` (`MULTIPLICA_ALLOW_PLACEHOLDER_ENV=1`) | PASS |

---

## 2. Deploy Convex Development

| Ítem | Valor |
| --- | --- |
| Comando | `npx convex dev --once` (sin `--prod`, sin anonymous) |
| Target | `[Development] … multiplica-v2-clean … brainy-fennec-556` |
| Resultado | `Convex functions ready!` |
| `health:ping` | `{ "ok": true, "message": "convex-ok" }` |

### Integridad de datos (antes = después)

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

**DATA_INTACT = true.** Progreso de la persona de prueba **no modificado** (sigue `consolidar=completed` + `udv=pending` en DB; repair pendiente de FASE 2).

---

## 3. Commit y push

```
0a54a67 fix(formation): Consolidar equals UDLV stages before Destino unlock
→ origin/cursor/convex-pastoral-cutover-a3cc
```

PR #23 **no** mergeado.

---

## 4. Vercel Preview

| Proyecto | Estado | URL |
| --- | --- | --- |
| **multiplica-v2-clean** (autorizado) | **success / READY** | https://multiplica-v2-clean-lj0h378bt-multiplica1.vercel.app |
| multiplica-v2-cursor (también disparó) | success | https://multiplica-v2-cursor-es1vkneh7-multiplica1.vercel.app |

Checks GitHub: `Vercel – multiplica-v2-clean` pass · `quality` pass.

### Clerk / Convex Development (no Production)

| Evidencia | Valor |
| --- | --- |
| Convex env `CONVEX_CLOUD_URL` | `https://brainy-fennec-556.convex.cloud` |
| Convex env `CLERK_JWT_ISSUER_DOMAIN` | `https://boss-gull-2637.clerk.accounts.dev` (Development) |
| Deploy key usada | `dev:brainy-fennec-556` (no `prod:`) |
| Production | No tocada |

---

## 5. Pruebas de lectura de la ficha

**personId:** `mh74ze797byjv0sr7t2vnqhkzd8fxp4z`

| Prueba | Resultado |
| --- | --- |
| HTML live Preview desde esta VM | **No navegable** — Vercel Authentication SSO (302). Misma limitación que auditorías previas. |
| Estado DB (lectura Convex, sin mutar) | Persona intacta; agregado `consolidar` sigue `completed` en DB (esperado sin repair) |
| Estado UI **esperado con el código desplegado** (derivación) | Ver tabla abajo |

| UI esperada (código nuevo + datos actuales) | Valor |
| --- | --- |
| Ganar | Completado |
| Consolidar (derivado) | **En curso** (no Completado) |
| Siguiente etapa | **Pre-Encuentro** |
| Encuentro / Post-Encuentro | Pendientes |
| Capacitación Destino CTA | **Bloqueada** (`derivedComplete=false`) |
| Botón reparación | **Visible** (“Continuar Universidad de la Vida”) cuando corresponda |
| Persona / historial | Intactos |

> Tras FASE 2 (`repairConsolidarUdlvAction` autorizada), el agregado DB pasará a `in_progress` con Pre-Encuentro eligible; la UI ya muestra En curso sin ese repair gracias a la derivación.

---

## 6. No ejecutado (según restricciones)

- `repairConsolidarUdlvAction` / mutaciones de progreso  
- Seeds / bootstrap  
- Merge PR #23  
- Production / infra anterior  
- Cambios de credenciales o env en Vercel/Clerk  

---

## Resumen ejecutivo

| Entregable | Estado |
| --- | --- |
| Commit | `0a54a67` |
| Convex Dev deploy | OK · `health:ping` OK · datos intactos |
| Preview `multiplica-v2-clean` | READY · https://multiplica-v2-clean-lj0h378bt-multiplica1.vercel.app |
| Pruebas automatizadas | PASS |
| Lectura ficha HTML | Bloqueada por SSO Vercel; lógica verificada por código + datos Convex |

**FASE 1 COMPLETADA** — pendiente tu autorización para FASE 2 (reparación de datos de la persona de prueba).
