# Phase 8 — Cierre: Enviar / Ungimiento / Transferencias pastorales

## 1. Resumen

Fase 8 cierra el ciclo operativo de la Escalera del Éxito (**Enviar**) e implementa movilidad pastoral segura (Red, Ministerio, célula, líder directo, subárbol, desactivación con plan).

**Regla de oro:** NUNCA perder personas. Nunca borrar Persona Maestra ni historial. Toda transición es reconstructible.

**Confirmación:** Fase 9 **NO** iniciada. PR pendiente de aprobación humana (sin merge automático).

## 2. Branch

`cursor/phase-8-enviar-transferencias-a3cc` (base: `main` con PR #9 / Phase 7 reconciliada).

## 3. Migraciones

| Archivo | Estado |
|---------|--------|
| `src/db/migrations/0010_phase8_send_transfers.sql` | Aplicada a multiplica-dev |
| `src/db/rls/010_phase8_send_transfers_rls.sql` | Aplicada (ENABLE + FORCE) |
| Journal idx 10 | Registrado |

Contenido principal:

- `process_type` += `enviar`
- `pastoral_transfer_requests` + enums de tipo/status/structure_mode
- `leadership_relationship_history`
- `cell_leadership_history`
- Índices por status, person, ministries, actors

## 4. Modelo Enviar

Reutiliza `person_process_progress` / `person_process_events` con `process_type = enviar`.

Estados: `eligible` → `in_progress` → `completed` (sin tabla `enviar_personas`).

Entrada ordinaria: **EM3 completed** (`ensureSendEligible` desde Fase 7 / EM3 complete). Bypass ordinario denegado server-side (`SEND_NOT_ELIGIBLE`).

## 5. Ungimiento

Operación explícita `anointAfterSend` (y opcional `markEligible` en `completeSend`).

Reutiliza Phase 4 `markPersonEligible` → `person_leadership.status = eligible`.

## 6. Separación eligible / active

| Concepto | Significado |
|----------|-------------|
| Enviar completed | Formación/misión culminada |
| eligible / ungido | Apto para liderazgo |
| active | Activado Phase 4 + célula |

Completar Enviar **nunca** pone `active`, **nunca** crea célula, **nunca** crea credenciales.

## 7. Transfer requests

Entidad: `pastoral_transfer_requests`

Estados: `draft` → `pending` → `approved` → `executed` | `rejected` | `cancelled`

Motor: `previewTransfer` → `createTransferRequest` → `approveTransfer` → `executePastoralTransfer`

## 8. Cambio Red

Cierra fila actual de `person_organization_history` (`effective_to`) y abre nueva. No reescribe historia. Progreso formativo intacto.

## 9. Cambio Ministerio

Misma mecánica histórica. Modalidades:

- `move_with_structure`
- `move_person_only_and_reassign_structure`

Actualiza leadership/cells según plan; scopes de `user_role_assignments` se reasignan sin duplicar `users`.

## 10. Cambio célula

Cierra membership `active` → `transferred` + `leave_reason`; inserta nueva membership. Nunca edita `cell_id` histórico.

## 11. Cambio líder directo

Actualiza `person_leadership.direct_leader_person_id`, registra `leadership_relationship_history`, rebuild closure.

## 12. Subtree moves

Descendientes viajan con el nodo. Preview muestra impacto. Ciclos → `LEADER_SUBTREE_CYCLE`. Capacidad 12 → `LEADER_PARENT_CAPACITY_REACHED`.

## 13. Closure rebuild

Rebuild transaccional inline en `executePastoralTransfer` (+ helper `rebuildClosureForSubtree`):

- elimina links ancestrales del subárbol
- preserva self + edges internos
- inserta nuevos ancestros del padre destino

## 14. Desactivación

`deactivateLeader` sin estructura → inactive.

Con estructura → `LEADER_HAS_ACTIVE_STRUCTURE` + plan vía `leader_deactivation` / `buildDeactivationPlan`.

## 15. Reasignación

Plan exige resolución de miembros y líderes directos. Célula de 12 solo líderes activos; evangelística admite ordinarios.

## 16. Máximo dos células

Invariant vigente: 1 evangelística + 1 de 12. Receptor saturado no recibe tercera (`MAX_DIRECT_CELLS_REACHED`).

## 17. No-orphan invariant

Toda desactivación/reasignación debe dejar a cada persona en estado válido. Plan incompleto bloquea ejecución.

## 18. Organization history

Fuente histórica: `person_organization_history`. Pertenencia actual: `effective_to IS NULL`.

## 19. Leadership history

`leadership_relationship_history` para cambios de líder directo. Closure ≠ historial.

`cell_leadership_history` para cambios de responsable.

## 20. Autorización

Jerarquía Phase 0–4: líder en scope, superior, LG mismo Ministerio, Superadmin. Cross-ministry requiere aprobación. Lateral deny.

## 21. RLS

Tablas nuevas: ENABLE + FORCE. Anónimo DENY. Superadmin global; LG ministry; leader scoped; participante de request.

## 22. Permisos

`send.read|manage|complete`, `transfers.read|request|approve|execute`, `organization.transfer_network|transfer_ministry`, `leadership.reassign|move_subtree|deactivate_with_structure`, `cells.reassign_structure`.

## 23. Auditoría

`send.started|completed`, `leader.marked_eligible`, `transfer.requested|approved|rejected|executed`, `organization.network_changed|ministry_changed`, `leader.direct_leader_changed|subtree_moved|deactivated`, `closure.rebuilt`. Sin secretos.

## 24. UX

- `/enviar` — KPIs aptos / proceso / completados / ungidos / activados
- `/transferencias` — listado + solicitud contextual
- Persona Maestra — Escalera con ENVIAR separado de Liderazgo + historial org
- Dashboard — alertas pendientes Enviar / ungidos / transferencias
- Sidebar — Enviar + Transferencias

## 25. Concurrency

`SELECT … FOR UPDATE` + status guard en execute. `TRANSFER_ALREADY_EXECUTED` bloquea re-ejecución.

## 26. Rollback

Una sola transacción DB para mutaciones estructurales. Fallo → rollback completo (sin closure parcial).

## 27. Performance

Closure rebuild bulk insert por chunks; evita N roundtrips por arista.

## 28. Tests

- `src/modules/send/phase8.test.ts` — SendRules, TransferRules, permisos, códigos de error
- Tests unitarios previos de leadership/cells siguen cubriendo capacity / structure

## 29. Verificación live

`npx tsx --env-file=.env.local scripts/verify-phase8-send-transfers.ts`

Fixtures controlados (sufijo `P8*`). Happy paths: Enviar, Red, Ministerio+estructura, subtree, deactivation plan, receptor saturado, idempotencia, anon DENY.

## 30. PASS/FAIL

| Gate | Resultado |
|------|-----------|
| lint | **PASS** (0 errors) |
| typecheck | **PASS** |
| tests | **PASS** (105) |
| build | **PASS** (`/enviar`, `/transferencias` incluidos) |
| verify live | **PASS** (54/54) |

Verificación live (`scripts/verify-phase8-send-transfers.ts`): Enviar, ungimiento≠active, Phase 4 activation, Red history, Ministerio+estructura, subtree+closure, ciclo bloqueado, deactivation plan, no-orphan, max-2-cells, idempotencia, execute-not-approved DENY, anon DENY, audit.

## 31. Warnings

- Wizard multi-paso de transferencias es formulario contextual único (no 25 rutas); UX wizard completa puede refinarse.
- Concurrente multi-session stress no es suite dedicada; protección vía row lock + status.
- Scopes LG en listado transfers usan ministryIds del actor; participantes cross-ministry confían en requested_by / destination.

## 32. Deuda técnica

- Preview dry-run UI rica (impacto visual ORIGEN→DESTINO) básica; puede enriquecerse.
- Notificaciones outbox no implementadas (fuera de alcance).
- Cell responsibility reassignment como tipo `cell_reassignment` soportado en enum; flujo UI prioriza motor común.

## 33. Decisiones

1. Enviar = `person_process_*`, no tabla dedicada.
2. Ungido = Phase 4 `eligible`, no estado paralelo.
3. Activación = solo Phase 4.
4. Transfers = entidad + motor transaccional único.
5. Closure = rebuild, no historial; history explícita aparte.
6. Desactivación con estructura = plan obligatorio.
7. Fase 7 reconciliation respetada (UDV no gate; RE entre CD2–CD3; EM1–3).

## 34. Confirmación Fase 9 NO iniciada

**Fase 9 no iniciada.** Sin dashboard global final, BI, notificaciones multicanal, Classroom, producción ni hardening final.

---

### Fixtures / datos reales

- Verificación usa personas fixture nuevas (`P8*` / emails `*.multiplica.test`).
- No se borran Personas Maestras ni historial de datos pastorales reales.
- Seeds RBAC actualizan permisos Phase 8 en multiplica-dev.

### Esperar aprobación humana

No merge automático. Entregar este cierre y esperar OK humano.
