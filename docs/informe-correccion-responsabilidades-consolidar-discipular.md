# MULTIPLICA V2 — Corrección de responsabilidades entre módulos Consolidar / Discipular

**Rama:** `cursor/convex-pastoral-cutover-a3cc`  
**Convex Development:** `brainy-fennec-556`  
**Fecha:** 2026-10-10  
**Estado:** Corrección preparada y validada localmente. **Sin commit, push, deploy ni merge** (pendiente de autorización).

---

## 1. Causa exacta

La página del módulo **Consolidar** (`/proceso`) renderizaba, además de los KPI de UDLV (Pre / Encuentro / Post), una sección UI titulada:

> **Capacitación Destino · Re-Encuentro · EM**

con tarjetas `CD1`, `CD2`, `CD3`, `Re-Encuentro`, `EM1`, `EM2`, `EM3` y `Aptos CD1`, alimentadas por `getProcessDashboardCounts()` (`counts.cd1`, `counts.cd2`, etc.).

Esa sección es propia del módulo **03 Discipular** (Escuela de Líderes), no de **02 Consolidar** (Universidad de la Vida).  
No había fuga de lógica de negocio ni alteración de estados: era un **error de composición de UI** en `src/app/(app)/proceso/page.tsx`.

---

## 2. Corrección aplicada (sin commit)

### Archivo modificado

| Archivo | Cambio |
|---------|--------|
| `src/app/(app)/proceso/page.tsx` | Retiro exclusivo de la sección visual Discipular; retítulo del módulo a Consolidar / UDLV; KPIs solo Pre / Encuentro / Post + resumen Consolidar; enlace único “Ir a Discipular” → `/destino`. |

### Qué se retiró de Consolidar

- Sección `aria-labelledby="discipular"` con título *Capacitación Destino · Re-Encuentro · EM*
- KPI: CD1, CD2, CD3, Re-Encuentro, EM1, EM2, EM3, Aptos CD1
- Enlaces de cabecera a Destino / Re-Encuentro / Escuela Ministerial (sustituidos por un enlace a Discipular)

### Qué se mantiene en Consolidar

- Focalización UDLV: Pre-Encuentro, Encuentro, Post-Encuentro
- KPI: Consolidar en curso / completado / pendiente
- KPI por etapa: En Pre-Encuentro, En Encuentro, En Post-Encuentro
- Listado y filtros de personas en proceso Consolidar / UDV legacy
- Copy que aclara que Destino se habilita solo tras cerrar UDLV

### Verificación estática (post-cambio)

Búsqueda en `src/app/(app)/proceso/page.tsx` de:

- `counts.cd1|cd2|cd3|em1|em2|em3|reencuentro|aptosCd1`
- labels `CD1` / `Aptos CD1` / título *Capacitación Destino · Re-Encuentro*

→ **0 coincidencias** (no se renderizan indicadores de Discipular).

---

## 3. Indicadores de Discipular — disponibilidad

| Ruta | Vista | KPIs propios | Estado |
|------|-------|--------------|--------|
| `/destino` | Capacitación Destino | N1/N2/N3 curso-apto, Aptos N1–N3, pendientes, graduados | **Disponible** |
| `/reencuentro` | Re-Encuentro | Resumen RE (completados / pendientes / etc.) | **Disponible** |
| `/escuela-ministerial` | Escuela Ministerial | EM1/EM2/EM3 en curso-apto y completados | **Disponible** |
| Nav `03 Discipular` | Entrada a `/destino` + hijos Destino / RE / EM | Configurado en `nav-config.ts` | **Disponible** |

### Pendiente documentado (sin construir módulo nuevo)

No existe hoy una **vista hub única “Discipular”** que agregue en una sola pantalla los mismos 8 KPI compactos (CD1–CD3, RE, EM1–EM3, Aptos CD1) que se retiraron de `/proceso`.  
Esos indicadores viven repartidos en `/destino`, `/reencuentro` y `/escuela-ministerial` (y también aparecen en `/liderazgo`, fuera de Consolidar).  
**No se construyó un módulo/hub nuevo** — queda como pendiente opcional sujeto a autorización explícita.

Detalle menor de copy (no bloqueante): en `/destino` el enlace a `/proceso` aún dice “Escalera”; no se tocó para no ampliar el alcance.

---

## 4. Alcance respetado (no modificado)

| Requisito | Cumplimiento |
|-----------|--------------|
| Escalera del Éxito en ficha Persona Maestra (`ganar/[id]`) — 4 etapas y subprocesos | **Sin cambios** |
| Reglas: Ganar → habilita Consolidar; Consolidar = Pre+Enc+Post; Destino no antes de UDLV | **Sin cambios** (lógica en `formation/*`, tests de regresión verdes) |
| Registros, estados pastorales, estadísticas almacenadas, permisos, relaciones Convex | **Sin cambios** |
| Reparación persona de prueba | **No ejecutada** |
| Seeds / bootstrap | **No ejecutados** |
| Production / infraestructura anterior | **No tocada** |
| Commit / push / deploy / merge | **No realizados** (pendiente autorización) |

---

## 5. Evidencia de validaciones

Ejecutado en el entorno del agente tras `npm ci` (dependencias no estaban instaladas en el snapshot).

| Validación | Comando | Resultado |
|------------|---------|-----------|
| TypeScript | `npm run typecheck` | **PASS** (`tsc --noEmit`, exit 0) |
| ESLint | `npm run lint` | **PASS** (exit 0) |
| Tests regresión | `npm test` | **PASS** — 19 files / **195 tests** |
| Build | `npm run build` | **PASS** — incluye ruta `/proceso` |
| UI Consolidar sin KPI Discipular | grep estático en `proceso/page.tsx` | **PASS** — 0 matches |

---

## 6. Impacto funcional

- **Consolidar (`/proceso`)** deja de mostrar indicadores ajenos; el operador ve solo Universidad de la Vida.
- **Discipular** sigue operable por sus rutas existentes; no se pierde capacidad operativa de Destino / RE / EM.
- **Escalera del Éxito** en la ficha de persona sigue mostrando Ganar → Consolidar → Discipular → Enviar con subprocesos.
- **Ningún cambio de datos** ni de reglas de avance en backend.

---

## 7. Riesgos identificados

| Riesgo | Nivel | Mitigación / nota |
|--------|-------|-------------------|
| Operadores acostumbrados a ver CD/EM en `/proceso` | Bajo | Enlace “Ir a Discipular” + nav 03; copy aclara el límite de módulo |
| Ausencia de hub Discipular agregado | Bajo | Documentado como pendiente; vistas hijas cubren operación |
| Diff local sin commit | Info | Cambio solo en working tree; no desplegado a Preview hasta autorización |
| Preview HTML no verificado por SSO | Bajo | Validación de código + build; revisión visual pendiente del usuario en Preview tras deploy autorizado |

---

## 8. Diff resumido

```
src/app/(app)/proceso/page.tsx | +34 / -44
```

Un único archivo de UI. Sin cambios en Convex, schema, mutations, seeds ni ficha de persona.

---

## 9. Siguiente paso (requiere tu autorización)

1. Autorizar **commit** en `cursor/convex-pastoral-cutover-a3cc` (mensaje sugerido: `fix(ui): remove Discipular KPIs from Consolidar /proceso`).
2. Autorizar **push** y, si aplica, **deploy Preview** a `brainy-fennec-556`.
3. Revalidación visual en Preview: `/proceso` sin sección CD/RE/EM; `/destino`, `/reencuentro`, `/escuela-ministerial` intactos.
4. **No** ejecutar aún la reparación de la persona de prueba.

---

*Informe generado tras preparar la corrección. Working tree dirty solo en `src/app/(app)/proceso/page.tsx`.*
