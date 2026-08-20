# MULTIPLICA — Backfill one-shot `seed:bootstrapPreview` en `merry-kookaburra-415`

| Campo | Valor |
| --- | --- |
| Fecha | 2026-08-20 |
| Repo | `danielhoyos12/Multiplica-v2-Cursor` |
| Branch | `cursor/convex-pastoral-cutover-a3cc` |
| PR | [#23](https://github.com/danielhoyos12/Multiplica-v2-Cursor/pull/23) — draft |
| Proyecto Convex | `convex-bistre-kettle` |
| Preview deployment | `merry-kookaburra-415` |
| Preview lógico | `preview/cursor-convex-pastoral-cutover-a3cc` |
| Convex URL | `https://merry-kookaburra-415.convex.cloud` |
| Convex CLI | **1.44.0** |
| Fase de este documento | **READ-ONLY** — análisis y procedimiento; **no se ejecutó el seed** |

Documentos relacionados:

- [`docs/preview-foundation-bootstrap.md`](preview-foundation-bootstrap.md) — diseño original
- [`docs/preview-foundation-bootstrap-implementacion.md`](preview-foundation-bootstrap-implementacion.md) — implementación `56dca7b`
- [`docs/convex-preview-default-allow-bootstrap.md`](convex-preview-default-allow-bootstrap.md) — env Preview default

---

## 1. Executive summary

El backfill one-shot correcto es **`npx convex run seed:bootstrapPreview '{}'`** contra **`merry-kookaburra-415`**, usando una **Preview Deploy Key acotada al deployment** (`preview:merry-kookaburra-415|…`), **sin** `--prod`, **sin** `--deployment`, **sin** `seed:seedCatalogs`, **sin** `convex deploy`.

**No usar sola la Preview Deploy Key de Vercel** (`preview:<team>:<project>|…`): con `convex run` y sin `--deployment`, Convex 1.44.0 resuelve el target al **dev deployment por defecto** del proyecto — riesgo real de escribir en el deployment equivocado.

En la VM del agente al momento del análisis: **BLOCKED** para ejecutar o verificar live (sin credenciales Convex). El procedimiento es **GO** para ejecución humana controlada, tras prechecks read-only con la misma credencial.

**Por qué Vercel no sembró:** `--preview-run` en Convex 1.44.0 solo corre cuando el preview es **nuevo**. `merry-kookaburra-415` ya existía antes de agregar `--preview-run`.

---

## 2. Convex CLI 1.44.0 — comportamiento verificado

Verificado con `npx convex --version`, `npx convex run --help` y código fuente en `node_modules/convex@1.44.0`.

| Verificación | Resultado |
| --- | --- |
| Versión CLI | **1.44.0** |
| `convex run` args | `functionName` + JSON args `{}` |
| Selección explícita | `--deployment <name>` (p.ej. `merry-kookaburra-415`) |
| Production | `--prod` (**no usar**) |
| `internalMutation` vía CLI | Sí — `runFunctionAndLog` usa `client.setAdminAuth(adminKey)` |
| `--preview-run` en deploy | Solo en preview **nuevo** |

### Tipos de `CONVEX_DEPLOY_KEY` (CLI 1.44.0)

| Formato | Tipo | Alcance |
| --- | --- | --- |
| `preview:<team>:<project>\|<secret>` | Preview **project** key | Proyecto; usada por Vercel en deploy |
| `preview:<deploymentName>\|<secret>` | Preview **deployment** key | **Un solo deployment** |
| `prod:<deploymentName>\|<secret>` | Production deployment key | Production |
| `dev:<deploymentName>\|<secret>` | Dev deployment key | Dev personal |

Fuente: `node_modules/convex/src/cli/lib/deployment.ts`

### Regla crítica: `--deployment` + `CONVEX_DEPLOY_KEY`

Si la key es **deployment-scoped** (`preview:merry-kookaburra-415|…`), el CLI clasifica como `existingDeployment` con `source: "deployKey"`. En ese caso:

```text
The `--deployment` flag cannot be used with CONVEX_DEPLOY_KEY.
```

**No combinar** `--deployment` con una deployment key.

Con **project preview key** (`preview:team:project|…`), `--deployment merry-kookaburra-415` se resuelve **antes** que la key en la selección de target (`deploymentWithinProject`). Puede funcionar, pero la credencial sigue siendo más amplia que una deployment key.

### Project preview key sin `--deployment`

Con `CONVEX_DEPLOY_KEY=preview:team:project|…` y `convex run` sin flags, la selección cae en `handleOwnDev` → **dev default del proyecto**, no `merry-kookaburra-415`. **Peligroso.**

---

## 3. Estado de autenticación (VM del análisis)

| Credencial / sesión | Estado |
| --- | --- |
| `CONVEX_DEPLOY_KEY` | **MISSING** |
| `CONVEX_ACCESS_TOKEN` | **MISSING** |
| `~/.convex/config.json` | **MISSING** |
| `npx convex login status` | **Not logged in** |

**Prechecks live del deployment:** **BLOCKED / UNVERIFIABLE** en esa VM.

---

## 4. Preview Deploy Key — alcance y capacidades

### Key de Vercel (project preview key)

- Formato esperado: `preview:<team-slug>:convex-bistre-kettle|<secret>`
- **Puede** desplegar previews y, con `--deployment merry-kookaburra-415`, autorizar en ese preview.
- **No debe** usarse sola en `convex run` sin `--deployment` (apunta a dev default).

### Key acotada al deployment (recomendada)

- Formato: `preview:merry-kookaburra-415|<secret>`
- El CLI resuelve URL vía `deployment/url_for_key` y fija target **sin** flags extra.
- Puede ejecutar `internalMutation` con admin auth.
- **No puede** apuntar a Production (key ligada al nombre del deployment).

### Obtención de deployment key (sin persistir)

1. Convex Dashboard → deployment `merry-kookaburra-415` → Settings → Deploy Keys → Create
2. O, con PAT: `npx convex deployment token create backfill-one-shot --deployment merry-kookaburra-415` (imprime key; revocar después)

---

## 5. Verificación de `seed:bootstrapPreview` (código)

Inspeccionado en branch `cursor/convex-pastoral-cutover-a3cc` (commit `56dca7b`).

| Requisito | Confirmado |
| --- | --- |
| `internalMutation` | Sí (`convex/seed.ts`) |
| `args: {}` | Sí |
| `ALLOW_PREVIEW_BOOTSTRAP === "true"` | Sí — `assertPreviewBootstrapAllowed()` en `convex/lib/seedFoundation.ts` |
| Reutiliza `seedFoundationCatalogs` | Sí — mismo helper que `seedCatalogs` |
| Tablas tocadas | `networks`, `districts`, `roles`, `permissions`, `rolePermissions` |
| No crea | `ministries`, `persons`, `users`, `userRoleAssignments`, cells, leadership, formation, training, pastoral |
| No llama Clerk | Sí |
| Rol catálogo `superadmin` | Sí (fila en `roles`); **no** usuario ni assignment |
| Idempotente | Sí — upsert/insert-if-missing por natural keys |

**No usar `seed:seedCatalogs`** para este backfill: no tiene guarda Preview.

---

## 6. Prechecks del deployment `merry-kookaburra-415` (read-only)

Ejecutar **antes** del one-shot, con la **misma credencial** que usarás en el run.

### A. Confirmar env en el deployment

Con **deployment key** (sin `--deployment`):

```bash
CONVEX_DEPLOY_KEY='preview:merry-kookaburra-415|<SECRET>' \
  npx convex env get ALLOW_PREVIEW_BOOTSTRAP
```

Esperado: `true`

Con **PAT + `--deployment`**:

```bash
npx convex env get ALLOW_PREVIEW_BOOTSTRAP --deployment merry-kookaburra-415
```

### B. Confirmar función desplegada

```bash
CONVEX_DEPLOY_KEY='preview:merry-kookaburra-415|<SECRET>' \
  npx convex function-spec | rg 'bootstrapPreview|seedCatalogs'
```

Esperado: `seed:bootstrapPreview` presente.

### C. Confirmar tablas foundation vacías (inline query read-only)

```bash
CONVEX_DEPLOY_KEY='preview:merry-kookaburra-415|<SECRET>' \
  npx convex run --inline-query 'return {
    networks: (await ctx.db.query("networks").collect()).length,
    districts: (await ctx.db.query("districts").collect()).length,
    roles: (await ctx.db.query("roles").collect()).length,
    permissions: (await ctx.db.query("permissions").collect()).length,
    rolePermissions: (await ctx.db.query("rolePermissions").collect()).length,
    ministries: (await ctx.db.query("ministries").collect()).length,
    users: (await ctx.db.query("users").collect()).length,
    persons: (await ctx.db.query("persons").collect()).length,
  }'
```

Esperado pre-seed: foundation en `0`; pastoral en `0`.

### D. Confirmar que no es Production

- Key debe empezar por `preview:merry-kookaburra-415|`, **no** `prod:`
- No usar `--prod`
- Tras el run, verificar URL `https://merry-kookaburra-415.convex.cloud` (usar `-v` si hace falta)

| Precheck | Estado en VM del análisis |
| --- | --- |
| Target = merry-kookaburra-415 | **UNVERIFIABLE** |
| Tipo = Preview | **UNVERIFIABLE** (confirmado por contexto operativo) |
| `ALLOW_PREVIEW_BOOTSTRAP=true` | **UNVERIFIABLE** (configurado manualmente según operador) |
| Función desplegada | **UNVERIFIABLE** |
| Tablas vacías | **UNVERIFIABLE** |

---

## 7. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Vercel project preview key sin `--deployment` | **Alto** — puede escribir en dev. No recomendado. |
| `--deployment` + deployment-scoped key | CLI **aborta** — no usar ambos. |
| Usar `seed:seedCatalogs` | Sin guarda Preview — **prohibido** para este backfill. |
| PAT global + typo en `--deployment` | Medio — verificar URL/nombre antes del run. |
| `ALLOW_PREVIEW_BOOTSTRAP` en Production | `bootstrapPreview` fallaría si no es `"true"`. |
| Re-ejecutar seed | Idempotente; parchea catálogos, no duplica por natural keys. |
| Clerk | Seed no toca Clerk; no debería crear usuarios Clerk. |

---

## 8. Comando EXACTO recomendado — NO EJECUTADO

### Opción A — preferida (menor alcance)

```bash
CONVEX_DEPLOY_KEY='preview:merry-kookaburra-415|<DEPLOYMENT_PREVIEW_KEY>' \
  npx convex run seed:bootstrapPreview '{}'
```

- Sin `--deployment` (la key ya fija el target)
- Sin `--prod`
- Sin `convex deploy`
- Sin `seed:seedCatalogs`

### Opción B — solo si no hay deployment key (mayor alcance)

```bash
unset CONVEX_DEPLOY_KEY CONVEX_DEPLOYMENT
npx convex login
npx convex run seed:bootstrapPreview '{}' --deployment merry-kookaburra-415
```

---

## 9. Cómo suministrar la credencial de forma segura

1. Obtener la **deployment key** de `merry-kookaburra-415` en Convex Dashboard (no Production key; preferir deployment key sobre project key).
2. En shell interactivo:

   ```bash
   read -rs CONVEX_DEPLOY_KEY && echo
   export CONVEX_DEPLOY_KEY
   ```

3. Ejecutar prechecks y el one-shot en la **misma sesión**.
4. Al terminar:

   ```bash
   unset CONVEX_DEPLOY_KEY
   ```

**No** copiar a `.env.local`, `.env`, repo, CI logs, ni commit.

Si la key viene de Vercel: copiar temporalmente desde Vercel → Settings → Environment Variables → Preview → `CONVEX_DEPLOY_KEY` **solo para la sesión**; preferir deployment key de Convex Dashboard.

---

## 10. Validación post-seed

En Convex Dashboard → `merry-kookaburra-415` → Data, o vía CLI read-only:

| Tabla | Esperado |
| --- | --- |
| `networks` | **4** — `hombres`, `mujeres`, `jovenes`, `ninos` |
| `districts` | **50** — `metroArea = "Lima Metropolitana"` |
| `roles` | **4** — `superadmin`, `leader_general`, `leader`, `staff` |
| `permissions` | **62** |
| `rolePermissions` | **177** filas (suma del `ROLE_PERMISSION_MAP`) |

Return esperado de la mutation:

```json
{
  "networks": 4,
  "districts": 50,
  "roles": 4,
  "permissions": 62,
  "rolePermissions": 177
}
```

Deben seguir en **0**:

`ministries`, `persons`, `users`, `userRoleAssignments`, `cells`, `personLeadership`, `trainingPrograms`, `trainingModules`, `trainingCycles`

Clerk: **ningún usuario nuevo**.

Re-ejecutar el mismo comando debe ser idempotente (mismos conteos, sin duplicados).

---

## 11. Confirmación de aislamiento de Production

El procedimiento recomendado (Opción A):

- **No** usa Production Deploy Key (`prod:…`)
- **No** usa `--prod`
- **No** modifica Production deployment
- **No** copia datos desde Production
- **No** ejecuta mutations contra Production
- `bootstrapPreview` falla si `ALLOW_PREVIEW_BOOTSTRAP !== "true"`

---

## 12. GO / BLOCKED

| Ámbito | Veredicto |
| --- | --- |
| **Procedimiento diseñado (Opción A + prechecks)** | **GO** |
| **Ejecución en VM del agente (análisis)** | **BLOCKED** — sin credenciales Convex |
| **Prechecks live** | **BLOCKED / UNVERIFIABLE** en VM |

### Condiciones GO (procedimiento humano)

| Condición | Estado |
| --- | --- |
| Target = `merry-kookaburra-415` | Sí — via deployment key o `--deployment` explícito |
| Preview deployment | Confirmado por contexto; verificar en Dashboard pre-run |
| `ALLOW_PREVIEW_BOOTSTRAP=true` | Confirmado por operador; verificar con `env get` pre-run |
| `bootstrapPreview` = `internalMutation` | Verificado en código |
| Credencial limitada al Preview | Sí con `preview:merry-kookaburra-415|…` |
| Production no puede ser target accidental | Sí con Opción A |

---

## Confirmaciones de la fase read-only del análisis

- No se ejecutó seed ni mutation
- No se ejecutó deploy
- No se modificó Production, Vercel, Clerk, ni variables de entorno
- No se imprimieron credenciales
- Este documento es solo procedimiento; **esperar aprobación explícita antes del one-shot**
