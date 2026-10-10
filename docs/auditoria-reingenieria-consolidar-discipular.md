# FASE 0 — Auditoría reingeniería Consolidar / Discipular / Multiplicación 3–12

**Rama:** `cursor/convex-pastoral-cutover-a3cc`  
**Convex Dev autorizado:** `brainy-fennec-556` (proyecto `multiplica-v2-clean`)  
**Fecha:** 2026-10-10  
**Alcance:** solo lectura de código + diff local pendiente; sin Production.

---

## 1. Diff local pendiente (conservado)

`src/app/(app)/proceso/page.tsx` — retira KPI de Discipular (CD1–EM3, Aptos CD1) del hub Consolidar.  
Informe previo: `docs/informe-correccion-responsabilidades-consolidar-discipular.md`.  
**Acción:** integrar en commit de FASE 1; no sobrescribir.

---

## 2. Matriz de capacidades

Leyenda: **EXISTE** · **PARCIAL** · **FALTA** · **REQUIERE CORRECCIÓN**

### 2.1 Navegación y UX

| Capacidad | Estado | Notas |
|-----------|--------|-------|
| Nav Escalera 01–04 | EXISTE | `nav-config.ts` |
| Consolidar → pantallas propias Pre/Enc/Post | FALTA | Hijos apuntan todos a `/proceso` |
| Discipular → pantallas propias CD1/CD2/CD3/EM1–3 | PARCIAL | Destino filtra `?nivel=`; EM sin filtro; sin hub |
| Dashboard ejecutivo | EXISTE | `/dashboard` + `metrics-ladder.ts` |
| Separación KPI Consolidar ≠ Discipular | REQUIERE CORRECCIÓN | Diff local en `/proceso` lo corrige |

### 2.2 Ganar

| Capacidad | Estado | Notas |
|-----------|--------|-------|
| Persona Maestra | EXISTE | `persons` + `/ganar/[id]` |
| Iniciar Consolidar → apto Pre | EXISTE | `startConsolidation` → `ensurePreEncuentroEligible` |
| Seguimiento CRM | PARCIAL | Notas/oración; no pipeline de tareas |
| Scope líder = subárbol en listados | REQUIERE CORRECCIÓN | Listado ministry-wide vs dashboard tree |

### 2.3 Consolidar / UDLV

| Capacidad | Estado | Notas |
|-----------|--------|-------|
| Modelo Pre/Enc/Post + aggregate | EXISTE | `consolidar-stages.ts`, schema |
| Derivación UDLV (no confiar en aggregate stale) | EXISTE | `deriveConsolidarLadderStatus` |
| Repair autorizado | EXISTE | `repairConsolidarUdlvAction` (no ejecutar masivo) |
| Legacy `udv` preservado | EXISTE | `/udv`; no gate a CD1 |
| Auto-apto Enc/Post tras aprobar etapa previa | FALTA | Solo Pre se abre como `eligible` |
| Bandeja aptos por etapa | FALTA | Conteos parciales; sin `listConsolidarEligible` |
| Ciclos / inscripción / asistencia dominio | PARCIAL | Funciones existen; sin actions/UI |
| Pantallas operativas por etapa | FALTA | |
| Aprobación con requisitos claros | PARCIAL | `completeConsolidarStage` no evalúa asistencia/académico |
| Historial de eventos | PARCIAL | Append-only; sin UI de historial formativo |

### 2.4 Discipular

| Capacidad | Estado | Notas |
|-----------|--------|-------|
| Secuencia CD1→CD2→RE→CD3→EM1→EM2→EM3 | EXISTE | `official-catalog.ts` |
| Destino UI + asistencia | EXISTE | `/destino`, board |
| Re-Encuentro UI | EXISTE | Copy aptos desactualizada (dice EM) |
| EM niveles backend | EXISTE | `em-levels.ts` |
| EM UI cableada a niveles oficiales | REQUIERE CORRECCIÓN | UI usa `ministerial.ts` legacy |
| Objetivos ministeriales | FALTA | |
| Hub Discipular agregado | FALTA | |

### 2.5 Enviar / Células / Jerarquía

| Capacidad | Estado | Notas |
|-----------|--------|-------|
| Enviar (EM3 → eligible) | EXISTE | `send/` |
| Activación líderes + células | EXISTE | `leadership/`, `cells/` |
| Asistencia células | EXISTE | |
| Closure / generaciones | EXISTE | `leadershipClosure` |
| G12 X/12 | EXISTE | Distinto del plan 3–12 |

### 2.6 Multiplicación 3–12 y calendario

| Capacidad | Estado | Notas |
|-----------|--------|-------|
| Expediente 3–12 | FALTA | |
| Lista de 15 contactos | FALTA | |
| Equipo de 12 discípulos (sin duplicar) | FALTA | |
| Objetivos por nivel CD1–EM3 | FALTA | |
| Estados líder (formación/apto/aprobado/activo+célula) | PARCIAL | Solo leadership status genérico |
| Calendario master académico | FALTA | Solo `trainingCycles.start/end` |
| Proyecciones A/B/C con estados EN PLAZO/RIESGO/… | FALTA | |

### 2.7 Reportes y RBAC

| Capacidad | Estado | Notas |
|-----------|--------|-------|
| Reportes genéricos + ladder | EXISTE | `/reportes` |
| Reportes multiplicación | FALTA | |
| Totales sin doble conteo jerárquico | PARCIAL | Scope tree en dashboard; verificar al extender |
| Permisos process/destination/em/re/send | EXISTE | `permissions.ts` |
| Authz en Convex queries/mutations | PARCIAL | Revisar al añadir tablas nuevas |

---

## 3. Arquitectura de datos reutilizable

- **Persona única:** `persons`
- **Progreso Escalera:** `personProcessProgress` + `personProcessEvents`
- **Formación:** `trainingPrograms/Modules/Cycles/Enrollments/Attendance/Requirements/Staff/Overrides`
- **Liderazgo:** `personLeadership` + `leadershipClosure`
- **Células:** `cells` + `cellMemberships` + asistencia
- **Auditoría:** `auditLogs`

**Nuevas tablas justificadas (FASE 4):** expediente de multiplicación, contactos (15), discípulos del equipo (≤12), hitos ministeriales — no cubiertos por G12 ni memberships.

---

## 4. Dependencias y reglas a preservar

1. Ganar habilita Consolidar; Consolidar = Pre+Enc+Post; CD1 no antes de UDLV derivado.
2. Apto ≠ inscrito ≠ matriculado en ciclo concreto.
3. Avance académico ≠ objetivo ministerial (no bloquear salvo regla explícita).
4. No migraciones destructivas; no repair masivo sin autorización.
5. No Production / no merge main.

---

## 5. Plan de implementación segura (post-auditoría)

| Fase | Entrega segura |
|------|----------------|
| 1 | Nav + rutas operativas propias; commit diff `/proceso` |
| 2 | Actions + UI Consolidar por etapa; auto-apto Enc/Post; bandejas |
| 3 | Hub Discipular; rutas CD/EM; cablear `em-levels` en UI |
| 4–5 | Schema multiplicación + proyecciones desde ciclos reales |
| 6 | Reportes multiplicación scoped |
| 7–8 | UI consistente + auditoría en writes |
| 9 | Tests + typecheck/lint/build + informe final |

**Decisiones / stops:** preinscripción condicionada (solo si reglas lo permiten); repair persona de prueba (requiere autorización); deploy Preview (anunciar destino ≠ Production).
