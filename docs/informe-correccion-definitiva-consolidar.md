# MULTIPLICA V2 — Informe: corrección definitiva de Consolidar / UDLV

| Campo | Valor |
| --- | --- |
| Fecha (UTC) | 2026-10-08 |
| Repo | `danielhoyos12/Multiplica-v2-Cursor` |
| Rama | `cursor/convex-pastoral-cutover-a3cc` |
| HEAD remoto / base | `9bbd2cb` |
| Working tree | Cambios locales **sin commit** |
| Convex Development | `dev:brainy-fennec-556` |
| Persona de prueba | `mh74ze797byjv0sr7t2vnqhkzd8fxp4z` |
| Commit / push / deploy / merge / reparación de datos | **No ejecutados** |

---

## 1. Causa raíz

Tras **Iniciar Consolidar**, la UI mostraba Consolidar = **Completado** con Pre-Encuentro / Encuentro / Post-Encuentro en Pendiente, y ofrecía **Ir a Capacitación Destino**.

Evidencia en Convex (lectura):

| processType | status | Notas |
| --- | --- | --- |
| `consolidar` | `completed` | `startedAt` ≠ `completedAt`; eventos `started` → `completed` |
| `udv` | `pending` | Legacy (`eligible_for_udv`); **no** es Universidad de la Vida |
| `pre_encuentro` / `encuentro` / `post_encuentro` | *(ausentes)* | UDLV nunca se inició |

**Causa:** `completeConsolidation` podía marcar el agregado `personProcessProgress` (`processType: consolidar`) como `completed` **sin** exigir Pre + Encuentro + Post. La Escalera y el CTA de Destino leían ese status crudo. El processType legacy `udv` se confundía conceptualmente con UDLV.

---

## 2. Reglas implementadas

1. **Ganar** es el primer paso (persona registrada).
2. **Consolidar** = **Universidad de la Vida (UDLV):** Pre-Encuentro → Encuentro → Post-Encuentro (en ese orden).
3. **Iniciar Consolidar** → agregado `in_progress` (En curso), **no** Completado. Solo se completa cuando las tres etapas UDLV están `completed`.
4. **Discipular** = Capacitación Destino + Re-Encuentro + Escuela Ministerial (no mezclar con UDLV).
5. No ofrecer Destino mientras UDLV esté pendiente; siguiente paso = **Pre-Encuentro**.
6. Una sola Persona Maestra (`personId` e historial preservados).
7. KPI distinguen en etapa / en curso / completadas sin contar un falso `completed` como cierre UDLV.
8. Reparación de la persona de prueba: **preparada**, no ejecutada.
9. Tests de regresión UDLV añadidos.
10. Jerarquía visual Consolidar → UDLV manteniendo la línea gráfica.

---

## 3. Secuencia Escalera del Éxito (código + UI)

```
01 Ganar
02 Consolidar
   └── Universidad de la Vida (UDLV)
         → Pre-Encuentro
         → Encuentro
         → Post-Encuentro
03 Discipular
   └── Capacitación Destino · Re-Encuentro · Escuela Ministerial
       (CTA Destino solo si UDLV derivedComplete)
04 Enviar
```

---

## 4. Gates verificados en código

| Componente | Comportamiento |
| --- | --- |
| `deriveConsolidarLadderStatus` | Status canónico; agregado falso `completed` → **En curso** |
| `startConsolidation` | `in_progress` + `ensurePreEncuentroEligible`; reopen con `clearCompletion` si hace falta |
| `completeConsolidation` | Exige `derivedComplete`; si no → `PREREQUISITE_NOT_MET`; delega en `syncConsolidarAggregate` |
| `syncConsolidarAggregate` | Solo cierra si Pre+Enc+Post `completed`; si no → `null` |
| `assertDestinoEligible` / `ensureDestinoN1Eligible` | Exigen las 3 etapas UDLV (no confían en agregado solo) |
| `getPersonLadder` | Usa `derivedComplete` / status derivado; next = Pre-Encuentro mientras UDLV incompleta |
| CTA ficha (`ganar/[id]`) | Iniciar / Continuar UDLV / Ir a Pre-Encuentro / Destino solo si `derivedComplete` |
| KPI (`metrics-ladder` + dashboard) | `consolidarInProgress` + `consolidarCompleted` derivados por persona |
| `repairConsolidarUdlvAction` | Reparación autorizada (Clerk + RBAC), idempotente |

---

## 5. Archivos

### Modificados

- `convex/formation.ts` — `clearCompletion` en `upsertProgress`
- `src/modules/formation/service.ts` — start / complete / ladder / repair / KPI proceso
- `src/modules/formation/actions.ts` — `repairConsolidarUdlvAction`
- `src/modules/formation/consolidar-stages.ts` — summary derivado + `ensurePreEncuentroEligible`
- `src/modules/formation/destination.ts` — gate UDLV para Destino
- `src/modules/formation/index.ts` — exports
- `src/modules/reporting/metrics-ladder.ts` — conteos derivados
- `src/app/(app)/ganar/[id]/page.tsx` — Escalera + CTAs
- `src/components/dashboard/dashboard-board.tsx` — hints KPI
- `src/components/dashboard/ladder-visualizer.tsx` — jerarquía UDLV
- `src/components/dashboard/preview-fixture.ts` — campos nuevos

### Nuevos

- `src/modules/formation/consolidar-status.ts`
- `src/modules/formation/consolidar-udlv.test.ts`
- `docs/reparacion-consolidar-persona-prueba.md`
- `docs/informe-correccion-definitiva-consolidar.md` *(este archivo)*

---

## 6. Resultados de verificación

| Check | Resultado |
| --- | --- |
| `npx tsc --noEmit` | **PASS** |
| `npm run lint` | **PASS** |
| Vitest (formation + reporting + dashboard + policy) | **91 tests PASS** |

---

## 7. Estado frente a la rama remota

| Ítem | Valor |
| --- | --- |
| `origin/cursor/convex-pastoral-cutover-a3cc` | `9bbd2cb` |
| HEAD local | `9bbd2cb` |
| Ahead / behind | 0 / 0 |
| Diff local sin publicar | ~11 archivos modificados + nuevos (código + docs + tests) |

Los cambios de esta corrección **aún no están en el remoto** ni en Preview.

---

## 8. Plan de despliegue a Preview (tras tu autorización)

1. **Commit** de los archivos de la corrección en `cursor/convex-pastoral-cutover-a3cc` (o branch derivado).
2. **Push** → Vercel Preview (`multiplica-v2-clean`) con  
   `NEXT_PUBLIC_CONVEX_URL=https://brainy-fennec-556.convex.cloud`.
3. **Push Convex** al Development:  
   `npx convex dev --once` con `CONVEX_DEPLOY_KEY` = `dev:brainy-fennec-556`  
   (**sin** `--prod`, **sin** Production).
4. Smoke UI: Escalera muestra Consolidar en curso (derivado) aunque el agregado DB siga mal hasta reparar.
5. Autorizar y ejecutar reparación de la persona de prueba (paso 9).

---

## 9. Procedimiento seguro de reparación (NO ejecutado)

Detalle: [`docs/reparacion-consolidar-persona-prueba.md`](./reparacion-consolidar-persona-prueba.md)

| Paso | Acción |
| --- | --- |
| Auth | Login Clerk superadmin en Preview |
| Ruta | Botón **“Continuar Universidad de la Vida”** → `repairConsolidarUdlvAction` |
| Efecto | `consolidar` → `in_progress`; limpia `completedAt` / `completedByUserId`; abre `pre_encuentro` eligible |
| Preserva | Persona Maestra, historial org, eventos, audits, fila legacy `udv` |
| Idempotencia | Si ya está correcto → `already_correct` (sin reescritura útil) |
| Prohibido | `npx convex run` con deploy key como bypass de RBAC pastoral |

---

## 10. Pendiente de tu autorización

- [ ] Commit + push  
- [ ] Deploy Preview + `convex dev --once` a `brainy-fennec-556`  
- [ ] Ejecutar reparación de `mh74ze797byjv0sr7t2vnqhkzd8fxp4z`  

**No** se ha tocado Production. **No** se ha reparado el dato todavía.
