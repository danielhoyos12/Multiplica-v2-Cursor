# MULTIPLICA V2 — Entrega: corrección definitiva de Consolidar / UDLV

| Campo | Valor |
| --- | --- |
| Fecha (UTC) | 2026-10-08 |
| Rama | `cursor/convex-pastoral-cutover-a3cc` |
| HEAD local = remoto | `9bbd2cb` (cambios **sin commit**) |
| Deployment objetivo | `dev:brainy-fennec-556` |
| Persona prueba | `mh74ze797byjv0sr7t2vnqhkzd8fxp4z` |
| Commit / push / deploy / merge / reparación datos | **NO ejecutados** — a la espera de autorización |

---

## 1. Causa raíz

`completeConsolidation` podía marcar el agregado `consolidar` como `completed` sin Pre-Encuentro + Encuentro + Post-Encuentro. La Escalera y el CTA de Destino leían ese status. En la persona de prueba: eventos `started`→`completed`, sin filas UDLV, con legacy `udv` pending.

## 2. Verificación de gates (implementado)

| Regla | Estado |
| --- | --- |
| `completeConsolidation` exige `derivedComplete` (3 etapas) | Sí — lanza `PREREQUISITE_NOT_MET` |
| `syncConsolidarAggregate` solo cierra si Pre+Enc+Post completed | Sí — retorna `null` si no |
| Destino (`assertDestinoEligible` / `ensureDestinoN1Eligible`) exige las 3 etapas | Sí |
| Escalera usa status derivado, no agregado crudo | Sí (`deriveConsolidarLadderStatus`) |
| Iniciar → `in_progress` + Pre-Encuentro; no completed; no Destino | Sí |
| CTA ficha: Pre-Encuentro / Continuar UDLV / Destino solo si `derivedComplete` | Sí |

## 3. Secuencia Escalera (UI)

```
01 Ganar
02 Consolidar
   Universidad de la Vida (UDLV)
   → Pre-Encuentro → Encuentro → Post-Encuentro
03 Discipular
   Destino · Re-Encuentro · Escuela Ministerial
   (CTA Destino solo tras UDLV completa)
04 Enviar
```

## 4. KPI Dashboard

- Consolidar funnel = personas **en curso** + **completadas UDLV** (derivado por persona; no cuenta falso `completed`).
- Hints: en curso / completadas / Pre·Enc·Post hechos.
- Ganar y Consolidar en curso pueden coexistir como métricas distintas etiquetadas.

## 5. Archivos corregidos / nuevos

**Modificados:**  
`convex/formation.ts`,  
`src/modules/formation/{service,actions,consolidar-stages,destination,index}.ts`,  
`src/modules/reporting/metrics-ladder.ts`,  
`src/app/(app)/ganar/[id]/page.tsx`,  
`src/components/dashboard/{dashboard-board,ladder-visualizer,preview-fixture}.*`

**Nuevos:**  
`src/modules/formation/consolidar-status.ts`,  
`src/modules/formation/consolidar-udlv.test.ts`,  
`docs/reparacion-consolidar-persona-prueba.md`,  
`docs/entrega-correccion-consolidar-udlv.md`

## 6. Resultados de verificación

| Check | Resultado |
| --- | --- |
| `tsc --noEmit` | PASS |
| `npm run lint` | PASS |
| Vitest (formation + reporting + dashboard + policy) | **91** tests PASS |

## 7. Estado vs remoto

- Remoto `origin/cursor/convex-pastoral-cutover-a3cc` = `9bbd2cb`
- Working tree: **11 archivos modificados + untracked** (docs + tests + `consolidar-status`)
- Ahead/behind: **0 / 0** (cambios solo locales, no pusheados)

## 8. Plan de despliegue a Preview (cuando autorices)

1. Commit en `cursor/convex-pastoral-cutover-a3cc` (o branch derivado) — **tras tu OK**.
2. Push → Vercel Preview `multiplica-v2-clean` con `NEXT_PUBLIC_CONVEX_URL=https://brainy-fennec-556.convex.cloud`.
3. Push Convex functions al **mismo** Development: `npx convex dev --once` con key `dev:brainy-fennec-556` (sin `--prod`).
4. Smoke: ficha persona (antes de reparar datos verá “Continuar UDLV” por status derivado En curso + agregado completed).
5. Luego autorizar reparación de datos.

## 9. Procedimiento seguro de reparación (NO ejecutado)

Ver [`docs/reparacion-consolidar-persona-prueba.md`](./reparacion-consolidar-persona-prueba.md).

Resumen:

- **Ruta:** `repairConsolidarUdlvAction` / botón UI “Continuar Universidad de la Vida”.
- **Auth:** Clerk session + `requireSessionUser` + RBAC de `startConsolidation`.
- **Prohibido:** `convex run` con deploy key como bypass.
- **Efecto:** reopen `in_progress`, clear completion stamps, Pre-Encuentro eligible; conserva persona, historial, audits, legacy `udv`; idempotente.

---

**Esperando autorización** para: commit/push, deploy Preview + Convex Dev, y/o ejecución de la reparación de la persona de prueba.
