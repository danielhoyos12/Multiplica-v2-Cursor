# Reparación segura — Persona Prueba Multiplica (Consolidar / UDLV)

| Campo | Valor |
| --- | --- |
| personId | `mh74ze797byjv0sr7t2vnqhkzd8fxp4z` |
| Deployment | `dev:brainy-fennec-556` |
| Rama | `cursor/convex-pastoral-cutover-a3cc` |
| Estado de este doc | **Procedimiento listo — NO ejecutar hasta autorización explícita** |

## Diagnóstico confirmado

| processType | status | Problema |
| --- | --- | --- |
| `consolidar` | `completed` | Completado sin Pre/Encuentro/Post |
| `udv` | `pending` | Legacy; **no** es UDLV — **conservar** |
| `pre_encuentro` / `encuentro` / `post_encuentro` | ausentes | UDLV no iniciada |

Eventos: `started` → `completed` vía antigua `completeConsolidation` sin gates UDLV.

## Ruta autorizada (única recomendada)

**No** usar `npx convex run` / deploy key como bypass administrativo para mutar progreso pastoral.

Usar la Server Action con sesión Clerk + RBAC:

1. `repairConsolidarUdlvAction({ personId })`  
   - `requireSessionUser()` (Clerk)  
   - `repairConsolidarUdlvState` → `startConsolidation`  
   - Permisos: `process.update` / scope ministerio  
   - Idempotente vía `needsConsolidarUdlvRepair`

2. **UI (tras deploy del fix a Preview):** en la ficha de la persona, botón  
   **“Continuar Universidad de la Vida”**  
   (visible solo si el agregado está falsamente `completed` y UDLV incompleta).

### Efectos esperados (una sola escritura si hace falta)

- Agregado `consolidar` → `status: in_progress`
- `clearCompletion: true` → limpia `completedAt` y `completedByUserId`
- `pre_encuentro` → `eligible` (si aún no está abierto)
- **Preserva:** Persona Maestra, `personOrganizationHistory`, `personProcessEvents`, `auditLogs`, fila legacy `udv`
- **No** desbloquea Capacitación Destino
- Si el estado ya es correcto → `{ repaired: false, reason: "already_correct" }` (sin escritura útil)

### Cómo autorizar la ejecución (cuando el humano lo pida)

```text
1. Desplegar este branch a Preview (Vercel) apuntando a brainy-fennec-556.
2. Login como superadmin Clerk Development.
3. Abrir /ganar/mh74ze797byjv0sr7t2vnqhkzd8fxp4z
4. Pulsar “Continuar Universidad de la Vida”
   — o invocar repairConsolidarUdlvAction desde un script de operador
     que use la misma sesión autenticada (nunca deploy key sola).
5. Verificar Escalera: Consolidar = En curso; siguiente = Pre-Encuentro;
   sin CTA Destino; KPI Consolidar en curso +1 / completadas sin esta persona.
```

## Prohibido

- `--prod` / Production
- Seeds / bootstrap
- Borrar persona o historial
- CLI `convex run formation:upsertProgress` sin JWT de usuario (bypass de RBAC pastoral)
