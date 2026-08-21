# MULTIPLICA — Prechecks read-only Preview `merry-kookaburra-415`

| Campo | Valor |
| --- | --- |
| Fecha | 2026-08-21 |
| Repo | `danielhoyos12/Multiplica-v2-Cursor` |
| Branch | `cursor/convex-pastoral-cutover-a3cc` |
| Proyecto Convex | `convex-bistre-kettle` |
| Target | `merry-kookaburra-415` (Preview) |
| Deploy key esperada | `backfill-one-shot` (deployment-scoped, 1 h) |
| Mensaje operador | `KEY_LOADED` |
| `CONVEX_DEPLOY_KEY` en proceso agente | **NOT_LOADED** |
| Fase | **READ-ONLY** — seed **NO** ejecutado |
| Veredicto | **BLOCKED** |

---

## Qué pasó con `KEY_LOADED`

El operador indicó `KEY_LOADED`, pero en el proceso del agente:

```text
CONVEX_DEPLOY_KEY=NOT_LOADED
```

No hay otras variables `CONVEX_*` en el entorno. Este run **no tiene Environment vinculado** (`environment: null` en cursor-cloud). Por eso un secret guardado en Settings → Cloud Agents → Environment **no llega a esta sesión**.

Se solicitó formalmente añadir el secret vía Cursor (`request-environment-setup-actions` → `CONVEX_DEPLOY_KEY`) para que el Portal muestre la acción de setup.

**Acción humana mínima (siguiente intento):**

1. Completa la acción **“Convex Preview Deploy Key for merry-kookaburra-415”** que Cursor te muestre (añadir secret `CONVEX_DEPLOY_KEY`).
2. Usa la key `preview:merry-kookaburra-415|…` de `backfill-one-shot` (no Production).
3. Si el secret solo aplica a Environments nuevos / builds: puede hacer falta **reiniciar o lanzar un agente nuevo** ya vinculado al Environment.
4. Vuelve a enviar **`KEY_LOADED`**.

**No pegues la key en el chat.**

---

## Resultados por precheck (esta ronda)

### PRECHECK 1 — Target

| Estado | **BLOCKED / NO EJECUTADO** |
| --- | --- |
| Motivo | Sin credencial |

### PRECHECK 2 — `ALLOW_PREVIEW_BOOTSTRAP`

| Estado | **BLOCKED / NO EJECUTADO** |
| --- | --- |

### PRECHECK 3 — `seed:bootstrapPreview` desplegada

| Estado | **BLOCKED / NO EJECUTADO** (live) |
| --- | --- |
| Código local | **PASS** — `internalMutation` en `convex/seed.ts` |

### PRECHECK 4 — Conteos

| Estado | **BLOCKED / NO EJECUTADO** |
| --- | --- |

### PRECHECK 5 — Production

| Confirmación | Estado |
| --- | --- |
| Production Deploy Key | **No usada** |
| `--prod` | **No** |
| Comandos contra Production | **Ninguno** |
| Production modificado | **No** |

### PRECHECK 6 — Código local

| Check | Resultado |
| --- | --- |
| `bootstrapPreview` = `internalMutation` | **PASS** |
| `ALLOW_PREVIEW_BOOTSTRAP === "true"` | **PASS** |
| Solo `seedFoundationCatalogs` | **PASS** |
| Inserts solo en 5 tablas foundation | **PASS** |
| Sin ministries / persons / users / assignments / pastoral / Clerk | **PASS** |
| Rol catálogo `superadmin` sin usuario | **PASS** |

**PRECHECK 6: PASS**

---

## Entrega final (10 puntos)

1. **Target resuelto:** BLOCKED (no verificado live)  
2. **Tipo de deployment:** BLOCKED (esperado Preview)  
3. **ALLOW_PREVIEW_BOOTSTRAP:** BLOCKED  
4. **Presencia de `seed:bootstrapPreview`:** BLOCKED live / PASS en código  
5. **Conteos actuales:** BLOCKED  
6. **Alcance del bootstrap:** PASS (código)  
7. **Production no tocada:** PASS  
8. **Credencial eliminada:** N/A (nunca cargada; nada que `unset`)  
9. **One-shot:** **BLOCKED**  
10. **Comando futuro (NO EJECUTADO):**

```bash
CONVEX_DEPLOY_KEY='<deployment-scoped-key>' \
  npx convex run seed:bootstrapPreview '{}'
```

Sin `--prod`, sin `--deployment` (si la key es `preview:merry-kookaburra-415|…`), sin `seed:seedCatalogs`, sin `convex deploy`.

---

## Confirmaciones

- No se ejecutó `seed:bootstrapPreview` ni `seed:seedCatalogs`
- No se ejecutó ninguna mutation ni `convex deploy`
- No se usó `--prod` ni Production
- No se imprimió ninguna Deploy Key
- Esperando secret inyectado + nuevo `KEY_LOADED` antes de prechecks live
