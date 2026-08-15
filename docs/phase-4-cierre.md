# Fase 4 — Cierre: Activación de líderes / Credenciales / Árbol G12 / Equipos de 12 / Navegación generacional

## 1. Resumen

Se implementó el **modelo pastoral de liderazgo G12** sobre Persona Maestra, Ministerios, Redes y Células (Fases 0–3):

- Distinción **eligible/ungido** vs **active**
- Regla absoluta: **no existe líder activo sin célula propia**
- Activación **atómica** (célula evangelística + relación generacional + usuario/credencial + auditoría)
- Árbol por Ministerio (adjacency + **closure table**)
- Progreso **X / 12**, conversión pastoral a Célula de 12
- Scope de árbol (descendientes / LG / superadmin)
- UX drill-down + breadcrumbs en `/liderazgo`

**Fase 5 NO iniciada.**

## 2. Branch

`cursor/phase-4-liderazgo-g12-a3cc` (base: `main` con Fases 0–3 mergeadas)

## 3. Migraciones

| Archivo | multiplica-dev |
|---|---|
| `src/db/migrations/0004_odd_ronan.sql` | Aplicada (`users.username`, `must_change_password`, `cell_memberships.role`) |
| `src/db/migrations/0005_high_deathbird.sql` | Aplicada (`person_leadership`, `leadership_closure`) |
| `src/db/rls/005_phase4_leadership_rls.sql` | Aplicada (RLS árbol + CHECK active⇒cell + unique active membership por role) |
| Seeds permisos `leaders.*` / `g12.convert_twelve` | Aplicados vía `npm run db:seed` |

## 4. Modelo de liderazgo

Tabla `person_leadership`:

- `status`: `none` | `eligible` | `active` | `inactive`
- `direct_leader_person_id` (null solo para raíz ministerial `is_ministry_root`)
- `primary_cell_id` **obligatorio si active** (CHECK DB)
- `human_leader_code` (identidad humana estable, no PK)
- timestamps / actores de eligible / activate / deactivate

RBAC (`roles`/`permissions`) ≠ liderazgo pastoral.

## 5. Modelo de árbol

- Relación directa: `direct_leader_person_id`
- Optimización: `leadership_closure` (ancestor, descendant, depth, ministry_id; depth 0 = self)
- Cada Ministerio General mantiene su propio árbol (sin mezclar los 12)

## 6. Estrategia generacional

- **12 / 144 / 1728** se derivan de profundidad (generaciones de líderes), no de campos hardcodeados
- El árbol puede crecer indefinidamente
- Solo cuentan para los 12: `status=active` + célula propia activa + hijo directo + mismo contexto organizacional
- Progreso UI: `X / 12 líderes`; `READY_FOR_TWELVE_CONVERSION` al completar 12
- Máx. **12 líderes directos activos** formales

## 7. Códigos humanos

- Preferencia: **identidad humana estable** + parentesco por UUID/FK
- Raíz: código de Ministerio (con resolución de colisión `-R2`… solo excepcional)
- Hijos: `PARENT-01`, `PARENT-01-03`, …
- No se renombra masivamente el subárbol ante transferencias (transferencias completas fuera de alcance)

## 8. Activación

Flujo atómico:

1. Persona `eligible`
2. Activador válido: **líder directo** o **Líder General del mismo Ministerio** (o Superadmin)
3. Abrir célula **evangelística**
4. Asignar responsable + `primary_cell_id`
5. Closure + código + rol `leader`
6. Provisionar usuario si falta
7. Auditoría
8. Rollback Auth si falla lo crítico

Errores: `LEADER_NOT_ELIGIBLE`, `LEADER_INVALID_ACTIVATOR`, `DIRECT_LEADER_*`, `LEADER_DIFFERENT_MINISTRY`, etc.

## 9. Credenciales

- Username: `first.last` / `first.last2`… (estable, único)
- Password temporal: generada en memoria, entregada **una vez** en la respuesta de activación
- Nunca en tablas de app, audit metadata, ni logs
- `users.must_change_password = true` + pantalla `/cuenta/cambiar-password`
- Supabase Auth almacena el hash

## 10. Conversión a Célula de 12

- Detecta ready cuando hay 12 líderes directos activos
- Acción explícita “Convertir en Célula de 12” (no silenciosa)
- Miembros ordinarios deben resolverse → evangelística residual del mismo líder
- Célula de 12: solo líderes activos (`twelve_team`); server-side
- Máx. **2 células directas** (evangelística + de 12)

## 11. Navegación

- `/liderazgo` — dashboard del líder (progreso, células, directos)
- `/liderazgo/[personId]` — drill-down + breadcrumbs
- `/liderazgo/activar/[personId]` — marcar apto + activar
- Mobile-first: listas / cards (sin árbol gráfico horizontal)

## 12. RLS

Helpers `SECURITY DEFINER`:

- `user_person_id()`
- `is_leadership_descendant()`
- `is_leader_general_for_ministry()`

Policies SELECT:

- Superadmin → global
- Leader General → su Ministerio
- Líder → self + descendientes (closure)
- Anonymous → DENY

Escrituras siguen yendo por servicios server-side (`DATABASE_URL` / service role).

## 13. Authz

- Permisos: `leaders.read|mark_eligible|activate|deactivate|manage_tree|view_descendants`, `g12.convert_twelve`
- `assertTreeAccess` en lecturas de dashboard / breadcrumbs / conversión
- Sibling deny / cross-ministry deny en dominio + RLS

## 14. Permisos (roles)

| Rol | Leaders / G12 |
|---|---|
| superadmin | todos |
| leader_general | todos en su Ministerio |
| leader | read, mark_eligible, activate, view_descendants, convert_twelve |
| staff | leaders.read |

## 15. Auditoría

Acciones: `leader.marked_eligible`, `leader.activated`, `leader.deactivated`, `leader.credentials_provisioned`, `leader.role_assigned`, `g12.twelve_converted` (+ preparado `g12.twelve_ready` / reassign en evolución).

Sin passwords/tokens/secretos.

## 16. Tests

- Unit: `src/modules/leadership/leadership.test.ts` (conteo G12, authz árbol, username, códigos de error)
- Policy / cells existentes actualizados con `personId`
- Live: `scripts/verify-phase4-leadership.ts` — **35 PASS / 0 FAIL**

## 17. Verificación live (multiplica-dev)

Confirmado:

- Activación real + células + códigos
- Descendientes / siblings / cross-ministry
- Breadcrumbs
- Lateral activator deny
- CHECK active sin célula
- Audit sin password
- Anon DENY en `person_leadership` / `leadership_closure`
- READY + conversión con 12 líderes y resolución de ordinarios
- Máx. 2 células post-conversión
- Bundle scan sin service_role / DATABASE_URL

Supabase MCP: `needsAuth` en este entorno; verificación vía `psql` + scripts.

## 18. Performance

- Índices en `direct_leader`, `status`, `ministry`, closure `(ancestor, depth)` / `descendant`
- Consultas de árbol vía closure (evita CTE recursivo por fila en RLS)
- Escala prevista: miles–decenas de miles de líderes con rebuild de closure al activar (rebuild masivo de subárbol en transferencias = deuda)

## 19. Seguridad

- `SUPABASE_SERVICE_ROLE_KEY` / `DATABASE_URL` solo server
- Temp password fuera de audit/logs/DB app
- UI hide ≠ seguridad: backend valida activador
- Password change flow preparado

## 20. PASS / FAIL

| Gate | Resultado |
|---|---|
| lint | PASS |
| typecheck | PASS |
| tests | PASS (41) |
| build | PASS |
| verify-phase4 | PASS (35) |
| Fase 5 no iniciada | PASS |

**Cierre Fase 4: PASS** (pendiente aprobación humana)

## 21. Warnings

- Códigos de raíz adicionales usan sufijo `-Rn` solo para colisiones (fixtures / excepciones admin)
- RLS de células (Fase 3) sigue siendo ministry-scoped; el aislamiento fino del árbol pastoral se aplica en servicios de liderazgo
- `must_change_password` se presenta con banner + página dedicada (no hard-block middleware global)

## 22. Deuda técnica

- Reasignación completa al desactivar líder (`LEADER_HAS_ACTIVE_STRUCTURE` bloquea)
- Transferencias entre Ministerios/Redes
- Rebuild de closure para subárboles al mover nodos
- Dashboard global final MULTIPLICA
- Visualización gráfica del árbol
- Tests E2E de UI navegación

## 23. Decisiones

1. `person_leadership` + `leadership_closure` (adjacency + closure)
2. Códigos humanos = identidad estable; parentesco = FK
3. Dual membership: `member` + `twelve_team` (responsabilidad ≠ membership)
4. Activación siempre abre evangelística (nunca Célula de 12 automática)
5. Conversión pastoral explícita con resolución de ordinarios
6. Username independiente del email/UUID

## 24. Confirmación Fase 5

**Fase 5 NO inició.** Fuera de alcance permanece: UDV, Destino, Escuela Ministerial, Consolidar/Discipular/Enviar completos, Classroom, dashboards finales globales, transferencias completas.
