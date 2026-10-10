# MULTIPLICA V2 — Informe de auditoría, implementación y pruebas

**Proyecto:** Multiplica-v2-Cursor  
**Rama:** `cursor/convex-pastoral-cutover-a3cc`  
**Convex Dev autorizado:** `brainy-fennec-556` (proyecto `multiplica-v2-clean`)  
**Fecha:** 2026-10-10  

**No Production · No merge a main · No seeds/bootstrap · Repair persona de prueba no ejecutado**

Auditoría detallada (FASE 0): `docs/auditoria-reingenieria-consolidar-discipular.md`

---

## A. Auditoría inicial y funcionalidades reutilizadas

### Hallazgos clave

| Área | Estado previo | Acción |
|------|---------------|--------|
| `/proceso` mezclaba KPI Discipular | REQUIERE CORRECCIÓN | Conservado e integrado el diff local |
| Dominio UDLV Pre/Enc/Post | EXISTE en `consolidar-stages.ts` | Cableado a UI + actions |
| Destino / RE | EXISTE operativo | Pantallas por nivel + hub |
| EM niveles vs legacy | REQUIERE CORRECCIÓN | UI/ciclo cableados a `em-levels.ts` |
| Plan 3–12 | FALTA | Nuevo expediente + proyecciones |
| Calendario master | FALTA | Proyecciones usan ciclos reales; sin inventar fechas |
| Repair UDLV stale aggregate | EXISTE | Respetado; no ejecución masiva |

### Reutilizado

- `personProcessProgress` / events / `training*`
- `deriveConsolidarLadderStatus`, `repairConsolidarUdlvState`, gate CD1 por UDLV
- Destino/RE boards, `UdvAttendanceBoard`, `EnrollmentPersonForm`
- Closure leadership, células, Enviar, dashboard ladder
- Permisos existentes (`process.*`, `consolidation.manage`, `destination.*`, `ministerial_school.*`, `leaders.activate`)

---

## B. Arquitectura final

```
Dashboard (ejecutivo)
01 Ganar          → /ganar
02 Consolidar     → /proceso (hub)
   Pre            → /proceso/pre
   Encuentro      → /proceso/encuentro
   Post           → /proceso/post
   Ciclo          → /proceso/ciclo/[cycleId]
03 Discipular     → /discipular (hub)
   CD1/CD2/CD3    → /discipular/cd{1,2,3}  (+ legacy /destino)
   Re-Encuentro   → /reencuentro
   EM1/EM2/EM3    → /discipular/em{1,2,3}  (+ /escuela-ministerial)
   Multiplicación → /discipular/multiplicacion[/personId]
04 Enviar         → /enviar, /liderazgo, /celulas, /enviar/multiplicacion→hub 3–12
```

**Reglas preservadas**

- Ganar habilita Consolidar (`ensurePreEncuentroEligible`).
- Consolidar completo solo con Pre+Enc+Post (derivado).
- Aprobar etapa abre apto siguiente; **no** matricula en ciclo.
- CD1 gated por UDLV derivado (no aggregate stale; `listDestinoEligible` corregido).
- Académico ≠ ministerial (objetivos 3–12 no bloquean avance).
- Escalera en ficha Persona Maestra intacta.

---

## C. Archivos y tablas modificados

### Tablas Convex nuevas (aditivas)

- `multiplicationExpedientes`
- `multiplicationContacts` (≤15; no son Persona Maestra hasta vincular)
- `multiplicationDisciples` (≤12; personId único por expediente)
- `multiplicationMilestones`

### Archivos principales

**Consolidar / formación**

- `src/modules/formation/consolidar-stages.ts` — auto-apto Enc/Post, bandejas, gaps
- `src/modules/formation/actions.ts` — actions Consolidar + EM levels
- `src/modules/formation/validation.ts`, `index.ts`, `destination.ts`, `em-levels.ts`
- `src/app/(app)/proceso/page.tsx` — sin KPI Discipular
- `src/app/(app)/proceso/pre|encuentro|post/page.tsx`
- `src/app/(app)/proceso/ciclo/[cycleId]/page.tsx`
- `src/components/formation/consolidar-stage-*`

**Discipular**

- `src/components/layout/nav-config.ts`
- `src/app/(app)/discipular/**`
- `src/app/(app)/escuela-ministerial/**` — niveles oficiales
- `src/app/(app)/reencuentro/[cycleId]/page.tsx` — copy CD2
- `src/components/formation/discipular-level-workbench.tsx`

**Multiplicación**

- `convex/schema.ts`, `convex/multiplication.ts`
- `src/modules/multiplication/**`
- `src/app/(app)/discipular/multiplicacion/**`
- `src/app/(app)/enviar/multiplicacion/page.tsx`

**Docs**

- `docs/auditoria-reingenieria-consolidar-discipular.md`
- `docs/informe-correccion-responsabilidades-consolidar-discipular.md`
- este informe

---

## D. Funcionalidades implementadas

1. Hub Consolidar limpio + 3 submódulos operativos (aptos, ciclos, inscripción, asistencia, aprobación).
2. Auto-habilitación Enc/Post/CD1 al aprobar etapa previa (como apto, no matrícula).
3. Hub Discipular con KPI CD/RE/EM.
4. Pantallas propias CD1–CD3 y EM1–EM3.
5. EM ciclo/listado cableados a `em-levels` (deja de operar solo legacy).
6. Expediente 3–12: contactos, equipo, hitos, contadores sin duplicar.
7. Proyecciones A/B/C con estados EN_PLAZO / EN_RIESGO / FUERA_DE_PLAZO / SIN_CALENDARIO_SUFICIENTE.
8. Nav Escalera actualizada a pantallas propias.

---

## E. Reglas de avance y permisos

| Acción | Permiso |
|--------|---------|
| Ver Consolidar/Discipular/3–12 | `process.read` (+ destination/ministerial read) |
| Crear ciclos | `school.cycles.manage` |
| Inscribir / aprobar UDLV | `consolidation.manage` |
| Destino / expediente 3–12 | `destination.manage` |
| EM niveles | `ministerial_school.manage/complete` |
| Marcar líder activo+célula en equipo | `leaders.activate` |
| Repair UDLV (existente, no masivo) | `process.update` vía action |

---

## F. Simulación cronológica (calendarios reales)

Las proyecciones **no inventan** fechas. Evaluación unitaria:

| Escenario | Resultado test |
|-----------|----------------|
| Sin ciclos | `SIN_CALENDARIO_SUFICIENTE` |
| CD1 con cierre futuro dentro de EM1 | `EN_PLAZO` |
| CD2/RE con fin anterior a hoy | `FUERA_DE_PLAZO` + Δ semanas negativa |
| EM3 sin Encuentro | `SIN_CALENDARIO_SUFICIENTE` |

En runtime, `buildProjectionsForStudent` toma ciclos activos/planned de EM/CD/RE/Encuentro del alcance del actor.

---

## G. Pruebas ejecutadas

| Suite | Resultado |
|-------|-----------|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS — **20** files / **202** tests (+7 plan 3–12) |
| `npm run build` | PASS — rutas nuevas listadas |

Cobertura nueva: contadores 3–12, no-duplicados, proyecciones A/B/C; regresión UDLV/CD1 intacta.

---

## H. Limitaciones / decisiones pendientes

1. **Deploy schema a `brainy-fennec-556`**: codegen local apuntó a `anonymous:anonymous-local` (no Production). Push de tablas nuevas al Dev autorizado **pendiente de autorización explícita de deploy**.
2. **Preinscripción condicionada**: no implementada (requiere regla de negocio).
3. **Repair persona de prueba**: no ejecutado.
4. **Asistencia grupal “clase → lista → guardar”**: se reutiliza board por módulo/inscrito; UX iPad-first dedicada puede refinarse.
5. **Reportes jerárquicos 3–12 en `/reportes`**: contadores en hub; export tipado pendiente.
6. **Scope Ganar leader=tree**: deuda previa documentada, no corregida en este alcance.
7. **Semilla Destino dual** (4 vs 20 módulos): documentada; no migración destructiva.
8. Preview UAT URL: depende de deploy Vercel Preview autorizado tras push.

---

## I. URL Preview UAT

No se desplegó Preview adicional en esta sesión.  
Tras autorizar push + deploy:

- Vercel Preview del PR de `cursor/convex-pastoral-cutover-a3cc`
- Convex **solo** `dev:brainy-fennec-556` (nunca Production)

---

## J. Instrucciones de verificación manual

1. **Consolidar hub** `/proceso` — sin CD1/EM/Aptos CD1; enlaces a Pre/Enc/Post.
2. **Pre** `/proceso/pre` — bandeja aptos, crear ciclo, activar, abrir ciclo, inscribir, asistencia, “Aprobar y habilitar Encuentro”.
3. **Encuentro / Post** — mismos flujos; Post → “Finalizar UDLV y habilitar CD1”.
4. **Ficha** `/ganar/[id]` — Escalera 4 etapas intacta; Destino solo si UDLV completo.
5. **Discipular** `/discipular` — KPI; abrir CD1–CD3 y EM1–EM3.
6. **EM ciclo** — inscripción/completado por nivel oficial (no legacy único).
7. **RE** — copy “CD2 completada”.
8. **3–12** — abrir expediente, 15 contactos, vincular ganado, asignar slots sin duplicar, ver proyecciones.
9. **Enviar → Multiplicación** — redirige al hub 3–12.
10. Confirmar que **no** se alteró Production ni se ejecutó repair masivo.

---

## Criterio de éxito — estado

| Criterio | Estado |
|----------|--------|
| Líder gana → consolida → forma → células → supervisa multiplicación | **Base operativa lista** (persistencia real en Dev tras deploy schema) |
| Estudiante CD1–EM3 con desafío 3–12 verificable | **Expediente + proyecciones implementados** |
| Pastor supervisa generaciones | **Dashboard/closure existentes**; reportes 3–12 en hub (export tipado pendiente) |
| Datos reales, permisos, historial, calendarios | **Sí en código**; schema Dev autorizado pendiente de push |

---

*Fin del informe.*
