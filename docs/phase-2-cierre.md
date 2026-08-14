# Fase 2 — Cierre GANAR / Persona Maestra

## 1. Resumen

GANAR queda como **fuente única de verdad** de personas en MULTIPLICA.

- Registro interno autenticado (`/ganar`, `/ganar/nueva`, `/ganar/[id]`)
- Formulario público sin login (`/ganar/registro`) vía server action → dominio → DB
- Pertenencia inicial Ministerio + Red con `person_organization_history`
- Deduplicación por teléfono normalizado (interna con advertencia; pública silenciosa)
- Aislamiento por Ministerio (authz + RLS)
- Petición de oración sensible (indicador en listado; texto solo en detalle; no en auditoría)

**Fase 3 NO iniciada** (sin células, G12, escuelas, Consolidar/Discipular/Enviar).

## 2. Branch

`cursor/phase-2-ganar-a3cc` (base: `main` con Fases 0 y 1 mergeadas)

## 3. Migraciones

| Archivo | Aplicado en multiplica-dev |
|---|---|
| `src/db/migrations/0002_dapper_living_lightning.sql` | Sí |
| `src/db/rls/003_phase2_ganar_rls.sql` | Sí |

Antes de migrar: drift detectado — `persons` aún sin columnas Phase 2; `person_intake_events` inexistente; policies de SELECT en persons ausentes (deny-by-default). Post-migración alineado con el repo.

## 4. Tablas creadas/modificadas

**Modificadas — `persons`**

- `phone_normalized`
- `address`
- `prayer_request`
- `source` (`person_source`: `internal_form` \| `public_form`)
- `is_active`
- `registered_at`

**Creadas — `person_intake_events`**

Telemetría / rate-limit del formulario público (hashes de IP/UA, outcome, sin texto de oración).

**Reutilizadas**

- `person_organization_history` (pertenencia actual = `effective_to IS NULL`)
- `districts`, `ministries`, `networks`, `audit_logs`

## 5. RLS policies

- `person_current_ministry_id(uuid)` — helper SECURITY DEFINER
- `persons_select_scoped` — superadmin o ministerio actual en `user_ministry_ids()`
- `person_organization_history_select_scoped` — idem por `ministry_id`
- `person_intake_events_select_superadmin` — solo lectura superadmin
- Anonymous: **sin** policies de INSERT/UPDATE/DELETE/SELECT efectivas → DENY

Mutaciones GANAR: solo vía servicios server-side (`DATABASE_URL` / rol postgres), nunca insert anónimo a PostgREST.

## 6. Endpoints / Server Actions

| Action | Uso |
|---|---|
| `createPersonInternalAction` | Alta interna + dedupe warn |
| `updatePersonAction` | Edición básica scoped |
| `submitPublicPersonAction` | Alta pública (honeypot, rate-limit, respuesta neutra) |
| `loadInternalCatalogsAction` / `loadPublicCatalogsAction` | Catálogos |
| `listPersonsAction` / `getPersonDetailAction` | Lectura scoped |

Rutas UI:

- `/ganar` — listado, stats, filtros
- `/ganar/nueva` — formulario interno
- `/ganar/[id]` — detalle + edición + placeholder Escalera del Éxito
- `/ganar/registro` — público (`?ministry=` / `?network=` como hints validados server-side)

## 7. Modelo Persona Maestra

- PK UUID
- `first_name` + `last_name` (UI pide nombre completo; `splitFullName` / `formatFullName`)
- teléfono + `phone_normalized`
- dirección, `district_id`, email opcional
- `prayer_request`, `registered_at`, `is_active`, `source`
- soft delete `deleted_at`
- pertenencia actual e historial vía `person_organization_history`

## 8. Estrategia de deduplicación

| Caso | Interno | Público |
|---|---|---|
| **Fuerte** (mismo teléfono normalizado / últimos 9 dígitos) | Advertencia + link al existente; `forceCreate` opcional | Respuesta neutra de éxito; no crea; log `duplicate_silent` |
| **Posible** (nombre similar) | Advertencia; requiere confirmación | No se revela; puede crear si no hay match fuerte |

Decisión pública: **nunca enumerar existencia**. Preferimos silent-success sobre “ya registrada”.

## 9. Seguridad formulario público

- Browser → Server Action → `createPersonPublic` → DB
- Validación Zod estricta + límites de longitud
- Honeypot `website`
- Rate limit ~10 submissions / IP hash / 10 min
- Ministerios/redes/distritos validados server-side
- Query params solo preselección; IDs inválidos ignorados/rechazados
- Sin `service_role` en cliente
- Errores genéricos hacia el usuario

## 10. Auditoría

Acciones:

- `person.created.internal`
- `person.created.public`
- `person.updated`
- `person.possible_duplicate_detected`

Metadata: ministry/network/source/flags. **Nunca** texto completo de petición de oración (`sanitizeAuditPayload` + `hasPrayerRequest` booleano).

## 11. UX implementada

- Mobile-first en formulario público (campos grandes, CTA visible, confirmación + “Registrar otra”)
- Listado GANAR con indicadores (total / semana / mes / por Red), buscador y filtros server-side
- Listado: indicador “Sí” si hay oración; contenido solo en detalle
- Sin selector de célula
- Niños no aparece en desplegables de captura

## 12. Tests

`src/modules/ganar/ganar.test.ts` (+ policy Phase 1):

1. Validación interna/pública  
2. Normalización teléfono  
3. Duplicado fuerte / posible  
4. Superadmin global / leader scoped / cross-ministry deny  
5. Niños inactive  
6. Oración no aparece en auditoría  

Live: `scripts/verify-phase2-ganar.ts` — 18/18 PASS (anon DENY, create, history, audit, dedupe, public boundary, isolation, bundle scan).

## 13. Verificación live

Ejecutado contra `multiplica-dev` (pooler):

- Migración 0002 + RLS 003 aplicadas
- Creates internos/públicos reales
- Org history open row
- Audit sin texto de oración
- Anon SELECT vacío / INSERT DENY por RLS
- Leader B no lista ni edita persona de ministerio A
- Client bundles sin secretos

## 14. PASS/FAIL por criterio

| # | Criterio | Resultado |
|---|---|---|
| 1 | GANAR fuente maestra | PASS |
| 2 | Registro interno | PASS |
| 3 | Registro público sin login | PASS |
| 4 | Público no expone persons directo | PASS |
| 5 | Distritos desplegables | PASS |
| 6 | Ministerios dinámicos | PASS |
| 7 | Redes dinámicas | PASS |
| 8 | Niños desactivado | PASS |
| 9 | Sin célula en público | PASS |
| 10 | Asociación ministerio | PASS |
| 11 | Asociación red | PASS |
| 12 | Organization history | PASS |
| 13 | Aislamiento ministerios | PASS |
| 14 | Superadmin global | PASS |
| 15 | Dedupe sin filtrar al público | PASS |
| 16 | Oración protegida | PASS |
| 17 | Auditoría | PASS |
| 18 | RLS | PASS |
| 19 | Anonymous direct DENY | PASS |
| 20 | Sin secretos en cliente | PASS |
| 21 | lint | PASS (0 errors) |
| 22 | typecheck | PASS |
| 23 | tests | PASS |
| 24 | build | PASS |
| 25 | Fase 3 no iniciada | PASS |

## 15. Warnings

- Next.js 16 avisa que `middleware` conviene migrar a `proxy` (cosmético; no bloquea).
- Links públicos contextualizados usan código/UUID de ministerio; no hay tokens firmados todavía (preparado para fase futura).
- Verificación UI móvil automatizada vía browser no se grabó en este entorno; formulario es mobile-first y se validó por ruta + boundary server.

## 16. Deuda técnica

- Tokens de atribución firmados (`public_form_tokens`) no implementados — solo query hints validados.
- Transferencias pastorales / cierre de history rows pendientes de fase posterior.
- Paginación del listado no preserva todos los query params al cambiar de página.
- `assertCanMutate(..., "persons.read")` reutiliza el helper de mutación para lecturas (patrón ya usado en organización).

## 17. Decisiones tomadas

1. Nombre completo en UI → `first_name`/`last_name` normalizados en DB.  
2. Público: silent success en duplicado fuerte (anti-enumeración).  
3. Rate-limit + honeypot en intake events.  
4. Scope de persona = ministerio de la fila abierta en `person_organization_history`.  
5. Mutaciones siempre por servicio server-side; RLS solo SELECT scoped.  
6. Placeholder visual “Escalera del Éxito” sin workflows.

## 18. Confirmación Fase 3

**Fase 3 NO fue iniciada.** No hay células, membresías, árbol 12/144/1728, UDV/CD/EM, Re-Encuentro, Consolidar/Discipular/Enviar ni transferencias pastorales.
