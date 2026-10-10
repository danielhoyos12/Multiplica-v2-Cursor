# MULTIPLICA V2 — Cierre de brechas antes de UAT

**Rama:** `cursor/convex-pastoral-cutover-a3cc`  
**Fecha:** 2026-10-10  
**Convex Dev autorizado (destino previsto):** `brainy-fennec-556`  
**No desplegado · No Production · No merge · No repair · No seeds**

---

## A. Brechas encontradas

| # | Brecha | Severidad |
|---|--------|-----------|
| 1 | Aprobaciones Consolidar/RE/EM/Destino académico podían completarse sin asistencia | Crítica |
| 2 | Asistencia operativa solo matriz celular; sin flujo clase→lista→guardar grupal | Alta |
| 3 | Ganar listaba ministry-wide a líderes `tree` (acceso lateral) | Crítica |
| 4 | `multiplication*` Convex solo chequeaba permisos, no árbol/ministerio | Crítica |
| 5 | Objetivos 3–12 no calculados desde evidencia; líder activo sin cell/auth | Alta |
| 6 | Reportes sin tipo Multiplicación / totales sin dedupe | Alta |
| 7 | Proyecciones EN_PLAZO solo por solape CD1⊂EM1 sin cadena UDLV | Alta |

**Reglas no inventadas (documentadas):** el umbral pastoral “12 miembros de célula” en Destino sigue **desactivado** por `seedOfficialCatalog`; no se reactivó. Aprobaciones usan módulos `isRequired` del catálogo + conteos UDLV ya existentes en `ConsolidarRules` (4/3/4).

---

## B. Correcciones realizadas

1. **Aprobaciones:** `attendance-requirements.ts` + gates en `completeConsolidarStage`, `markAcademicCompleted`, `markEmLevelAcademic`, `completeReencuentro`. Mensaje de requisitos faltantes + auditoría con evidencia de asistencia.
2. **Asistencia grupal:** `GroupAttendancePanel` (ciclo → clase → inscritos → P/A/J → guardar grupal + historial/recuperación). Upsert enrollment×módulo (sin duplicar). iPad/desktop. Cableado en Consolidar/Destino/EM.
3. **Seguridad jerárquica Ganar:** `scopedActiveRows` + `assertPersonTreeAccess`; `canView(person)` ya no abre ministry-wide a líderes tree. LG/staff conservan ministerio.
4. **Convex `multiplication*`:** assert de propio/descendiente/LG; listados sin `.collect()` abierto para no-superadmin; `lider_activo_celula` exige célula activa + `personLeadership.status=active`.
5. **Objetivos 3–12:** `objectives.ts` calcula CD1–EM3 desde evidencia; estados de formación preservados.
6. **Reportes:** tipo `multiplication` en `/reportes` con totales propios/descendientes/consolidados y dedupe.
7. **Proyecciones:** cadena de dependencias; no EN_PLAZO sin UDLV/calendario Pre–Post.

---

## C. Pruebas ejecutadas

| Comando | Resultado |
|---------|-----------|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS (0 errors) |
| `npm test` | PASS — **23** files / **222** tests |
| `npm run build` | PASS |

Nuevos/extendidos: aprobación sin requisitos, asistencia counters, lateral deny / descendant allow / dos líneas, líder activo sin célula, duplicación discípulos, calendarios incompatibles, UDLV→CD1, agregados sin doble conteo.

---

## D. Pendientes (no bloquean autorización de deploy schema)

| Ítem | Nota |
|------|------|
| Deploy schema a `brainy-fennec-556` | **Requiere tu autorización explícita** |
| Preview Vercel UAT | Tras deploy Dev |
| Export XLSX tipado multiplicación | Mejora posterior (consulta numérica ya en Reportes) |
| Reactivar pastoral Destino 12 miembros | Decisión de negocio — no inventada |
| Repair persona de prueba | Esperando autorización |
| Verificación live proyecciones contra ciclos reales en Dev | Tras deploy schema |

**Bloqueos críticos de seguridad/aprobación/persistencia en código:** cerrados. Persistencia de tablas nuevas en Dev: pendiente de deploy autorizado.

---

## E. Estado de Git

Rama: `cursor/convex-pastoral-cutover-a3cc`  
Commits de esta oleada (tras push): ver log local `feat(uat-gaps): …`

Archivos clave tocados: formation attendance gates, GroupAttendancePanel, ganar/policy scope, `convex/multiplication.ts`, objectives/projections/reporting, tests, este informe.

---

## F. Destino exacto Convex Dev

| Campo | Valor |
|-------|--------|
| Proyecto | `multiplica-v2-clean` |
| Deployment autorizado | **`dev:brainy-fennec-556`** |
| Production | **No tocar** |
| Local codegen previo | `anonymous:anonymous-local` (no es el destino UAT) |

Plan de deploy seguro (cuando autorices):

1. Confirmar `CONVEX_DEPLOYMENT` / MCP status = `brainy-fennec-556` (dev).
2. Anunciar: `target: dev (brainy-fennec-556)`.
3. `npx convex deploy` / `convex dev --once` **solo** a ese deployment.
4. Verificar tablas `multiplication*` aditivas (sin drop).
5. Luego Preview Vercel del PR #23.

Tablas nuevas: **aditivas** (`multiplicationExpedientes|Contacts|Disciples|Milestones`). Compatibles con datos existentes; no migraciones destructivas.

---

## G. ¿Listo para solicitar autorización de deploy + Preview?

**Sí, con la salvedad explícita de que UAT funcional completo requiere el deploy de schema a `brainy-fennec-556`.**

- Código de brechas críticas: cerrado y validado (tsc/lint/tests/build).
- No se declara UAT “listo en producción de datos” hasta ese deploy.
- No se ha desplegado ni hecho merge.

**Solicitud recomendada al autorizar:**  
“Desplegar functions+schema a Convex Dev `brainy-fennec-556` y publicar Preview del PR #23. Sin Production, sin repair, sin seeds.”
