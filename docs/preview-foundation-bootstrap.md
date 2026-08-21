# MULTIPLICA — Bootstrap foundation en Convex Preview

| Campo | Valor |
| --- | --- |
| Fecha | 2026-08-17 |
| Repo | `danielhoyos12/Multiplica-v2-Cursor` |
| Branch | `cursor/convex-pastoral-cutover-a3cc` |
| PR | [#23](https://github.com/danielhoyos12/Multiplica-v2-Cursor/pull/23) — draft, **no mergeado** |
| Base | `staging` |
| Stack | Next.js + Convex 1.44.0 + Clerk + Vercel |
| Preview Convex de esta rama | `merry-kookaburra-415` (`preview/cursor-convex-pastoral-cutover-a3cc`) |
| Estado del preview | Schema/functions desplegados; **tablas vacías** |
| Recomendación | **NO crear una mutation pública.** Implementar `seed:bootstrapPreview` como `internalMutation` Preview-only + `--preview-run`. |

Este informe es **read-only**: no implementa el bootstrap, no ejecuta seeds, no despliega, no toca Production. Espera aprobación explícita antes de escribir código o cambiar infraestructura.

---

## Recomendación

No hay que crear una mutation pública `seed:bootstrapPreview`.

El mecanismo correcto es:

1. Extraer la lógica actual de `seed:seedCatalogs` a un helper compartido.
2. Añadir `seed:bootstrapPreview` como **`internalMutation`**, con guarda explícita de Preview.
3. Configurar en Convex Dashboard (solo Preview defaults): `ALLOW_PREVIEW_BOOTSTRAP=true`.
4. Añadir `--preview-run 'seed:bootstrapPreview'` al Build Command de Vercel.

`--preview-run` del CLI Convex **1.44.0** usa admin key y puede llamar `internalMutation`. Una mutation pública sería invocable por cualquiera que tenga `NEXT_PUBLIC_CONVEX_URL` del preview.

---

## A. Diagnóstico

### Cómo funciona hoy `seed:seedCatalogs`

Definida en `convex/seed.ts` como `internalMutation` (no callable desde el cliente Next/Clerk). El CLI la ejecuta con admin key:

```bash
npx convex run seed:seedCatalogs
npm run db:seed:convex   # scripts/seed-convex.ts
```

Args: `{}`. Helpers: `seedNetworks`, `seedDistricts`, `seedRoles`, `seedPermissions`, `seedRolePermissions`. Datos: `src/db/seeds/data.ts` y `src/db/seeds/permissions.ts`.

### Tablas que toca (solo estas)

| Tabla | Comportamiento | Volumen esperado |
| --- | --- | --- |
| `networks` | upsert por `code` | 4: `hombres`, `mujeres`, `jovenes`, `ninos` |
| `districts` | insert-if-missing por `(metroArea, name)` | 50 (Lima Metropolitana + Callao) |
| `roles` | upsert por `code` | 4: `superadmin`, `leader_general`, `leader`, `staff` |
| `permissions` | upsert por `code` | 62 |
| `rolePermissions` | insert-if-missing del mapa rol → permiso | una fila por entrada del mapa |

### Lo que no toca

- `ministries`
- `persons`
- `users`
- `userRoleAssignments`
- células / liderazgo / pastoral
- Clerk
- `formation:seedOfficialCatalog`

`formation:seedOfficialCatalog` es mutation **pública**, exige `requireSuperadmin`, y requiere argumentos (`seeds`, `legacyCodes`). Fuera de alcance de este bootstrap.

### Idempotencia

Sí para no duplicar: cada helper busca por índice único antes de insertar.

No es un no-op:

- Reejecutar **parchea** name / description / `isActive` de `networks`, `roles` y `permissions` al valor del seed.
- Distritos existentes no se actualizan (solo se insertan los faltantes).
- `rolePermissions` es aditivo: no borra vínculos que ya no estén en el mapa.
- Los `count` del return cuentan ítems del catálogo, no inserts netos.

Sí crea el **rol catálogo** `superadmin`. No crea un usuario superadmin ni una assignment. Eso es necesario para RBAC; no viola “no crear superadmin” como cuenta.

### Riesgo actual

`seed:seedCatalogs` **no tiene guarda de Production**. `npx convex run seed:seedCatalogs --prod` sí escribiría/parcharía catálogos en prod.

### Intento manual previo

```bash
npx convex run seed:seedCatalogs --deployment merry-kookaburra-415
```

Falló con CLI no autenticado (`401 MissingAccessToken`). No se escribió ningún dato. El preview sigue vacío.

### Configuración actual

- No hay `vercel.json` ni `convex.json` en el repo. El Build Command vive en Vercel Project Settings.
- Convex instalado: **1.44.0** (`package.json`: `"convex": "^1.44.0"`).
- Build Next: `MULTIPLICA_ALLOW_PLACEHOLDER_ENV=1 next build`.
- Script local: `"db:seed:convex": "tsx --env-file=.env.local scripts/seed-convex.ts"`.

---

## B. Arquitectura propuesta

### Qué no hacer

No exportar `bootstrapPreview` como `mutation` pública. `NEXT_PUBLIC_CONVEX_URL` es público; una mutation pública sería invocable sin Clerk.

### Qué hacer

`--preview-run` usa admin key (`setAdminAuth`) y puede llamar `internalMutation`. Convex no permite `ctx.runMutation` desde otra mutation, así que hay que extraer un helper.

1. Extraer el handler actual a `seedFoundationCatalogs(ctx)`.
2. Dejar `seed:seedCatalogs` igual: uso local / `db:seed:convex`.
3. Añadir `seed:bootstrapPreview` como `internalMutation`, args `{}`, que:
   - exige `process.env.ALLOW_PREVIEW_BOOTSTRAP === "true"`
   - llama `seedFoundationCatalogs`
   - no crea personas, usuarios, assignments, ministerios, pastoral ni formation
4. En Convex Dashboard, variable **solo en Preview defaults** (nunca Production): `ALLOW_PREVIEW_BOOTSTRAP=true`.

### Capas de protección

| Capa | Qué cubre |
| --- | --- |
| `internalMutation` | El browser / Next no puede llamarla |
| `--preview-run` ignorado en deploys a Production | El CLI 1.44 no la ejecuta con Production deploy key |
| `--preview-run` solo si `isNewDeployment` | No re-siembra en rebuilds del mismo preview |
| `ALLOW_PREVIEW_BOOTSTRAP` fail-closed | Si alguien corre la función a mano contra prod (sin esa env), aborta |

`--preview-run 'seed:seedCatalogs'` funcionaría hoy, pero **no** tiene guarda de Production. El wrapper sí.

### Limitación crítica del CLI 1.44

En `node_modules/convex/src/cli/deploy.ts`:

```ts
if (options.previewRun !== undefined && data.isNewDeployment) {
  await runFunctionAndLog(...)
}
```

`--preview-run` corre **solo al crear un preview nuevo**. Changelog 1.44: *“When using the `--preview-run` flag, the function only runs when a new deployment is created.”*

`merry-kookaburra-415` ya existe y está vacío: el próximo deploy de esta rama **no** sembrará. Hace falta un `convex run` autenticado de una sola vez, o un preview de una rama nueva, **después** de aprobar el código.

### Secuencia operativa (cuando se apruebe)

1. Setear `ALLOW_PREVIEW_BOOTSTRAP=true` en Preview defaults de Convex.
2. Implementar el diff de `convex/seed.ts`.
3. Cambiar el Build Command de Vercel.
4. Backfill de `merry-kookaburra-415` como paso aparte (esta rama ya tiene preview).

Si la env falta en un preview **nuevo**, el seed falla **después** del push de funciones; el rebuild siguiente ya no reintenta `--preview-run`. Por eso la env debe existir **antes** de cambiar el Build Command.

---

## C. Diff propuesto (no aplicado)

Solo `convex/seed.ts`. El Build Command de Vercel no está en el repo.

```diff
--- a/convex/seed.ts
+++ b/convex/seed.ts
@@ -162,6 +162,29 @@ async function seedRolePermissions(ctx: MutationCtx) {
   return count;
 }
 
+async function seedFoundationCatalogs(ctx: MutationCtx) {
+  const networks = await seedNetworks(ctx);
+  const districts = await seedDistricts(ctx);
+  const roles = await seedRoles(ctx);
+  const permissions = await seedPermissions(ctx);
+  const rolePermissions = await seedRolePermissions(ctx);
+  return { networks, districts, roles, permissions, rolePermissions };
+}
+
+const catalogSeedReturns = v.object({
+  networks: v.number(),
+  districts: v.number(),
+  roles: v.number(),
+  permissions: v.number(),
+  rolePermissions: v.number(),
+});
+
+function assertPreviewBootstrapAllowed() {
+  if (process.env.ALLOW_PREVIEW_BOOTSTRAP !== "true") {
+    throw new Error(
+      "seed:bootstrapPreview refused: ALLOW_PREVIEW_BOOTSTRAP is not 'true'. Preview-only.",
+    );
+  }
+}
+
 /**
  * Idempotent seed of foundation catalogs: networks, Lima Metropolitana
  * districts, RBAC roles, permissions, and the role → permission map.
@@ -175,19 +198,28 @@ async function seedRolePermissions(ctx: MutationCtx) {
 export const seedCatalogs = internalMutation({
   args: {},
-  returns: v.object({
-    networks: v.number(),
-    districts: v.number(),
-    roles: v.number(),
-    permissions: v.number(),
-    rolePermissions: v.number(),
-  }),
-  handler: async (ctx) => {
-    const networks = await seedNetworks(ctx);
-    const districts = await seedDistricts(ctx);
-    const roles = await seedRoles(ctx);
-    const permissions = await seedPermissions(ctx);
-    const rolePermissions = await seedRolePermissions(ctx);
-
-    return { networks, districts, roles, permissions, rolePermissions };
-  },
+  returns: catalogSeedReturns,
+  handler: async (ctx) => seedFoundationCatalogs(ctx),
+});
+
+/**
+ * Preview-only entrypoint for `npx convex deploy --preview-run`.
+ * Reuses seedFoundationCatalogs. Does not seed persons, users, ministries,
+ * pastoral data, or formation:seedOfficialCatalog.
+ */
+export const bootstrapPreview = internalMutation({
+  args: {},
+  returns: catalogSeedReturns,
+  handler: async (ctx) => {
+    assertPreviewBootstrapAllowed();
+    return await seedFoundationCatalogs(ctx);
+  },
 });
```

No cambios en `package.json`, Clerk, formation, ni Production.

---

## D. Build Command

El setting actual de Vercel es **sintaxis válida** en Convex **1.44.0**:

```bash
npx convex deploy --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL --cmd 'npm run build'
```

Usar guiones ASCII `--`, no en-dashes `–`. `--cmd-url-env-var-name` y `--cmd` existen en 1.44.0 y hacen lo que el proyecto necesita.

Después de aprobar código + env Preview, el Build Command debe ser:

```bash
npx convex deploy --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL --cmd 'npm run build' --preview-run 'seed:bootstrapPreview'
```

Confirmado en `npx convex deploy --help` de 1.44.0:

- `--preview-run <functionName>`
- ignorado si el deploy es a Production
- args fijos `{}` (la función no puede exigir argumentos)

No usar `--preview-create` en Vercel: recrearía el preview en cada build.

### Prerequisite de keys

| Entorno Vercel | `CONVEX_DEPLOY_KEY` |
| --- | --- |
| Preview | **Preview Deploy Key** |
| Production (si algún día despliega Convex) | **Production Deploy Key** |

El CLI 1.44 aborta si un build no-prod intenta usar una Production key (`--check-build-environment`, default `enable`).

---

## E. Flujo esperado

1. Vercel Preview build arranca con Preview `CONVEX_DEPLOY_KEY`.
2. `npx convex deploy` reclama el preview de la rama (`preview/cursor-…` → p.ej. `merry-kookaburra-415`).
3. Inyecta `NEXT_PUBLIC_CONVEX_URL` y corre `npm run build`. El build Next no necesita catálogos sembrados.
4. Typecheck + codegen + push de schema/functions a **ese** preview.
5. Si el preview es **nuevo**: corre `seed:bootstrapPreview` con admin key. La función exige `ALLOW_PREVIEW_BOOTSTRAP=true` y hace upsert de los 5 catálogos.
6. Si el preview **ya existía** (este caso): el CLI **no** corre `--preview-run`. Las tablas siguen como estaban.
7. Production: `--preview-run` no se ejecuta. Esta función no lee ni copia Production.

Para `merry-kookaburra-415`, el auto-seed de Vercel no rellenará el vacío actual. Eso queda como un one-shot autenticado **después** de aprobar.

Orden real del CLI en previews (`claimPreviewAndPush`): `--cmd` (build Next) → push de funciones → `--preview-run` si es deployment nuevo.

---

## F. Validación (Convex Dashboard → deployment preview)

Tras un bootstrap real (no ahora):

- [ ] Deployment = preview de la rama, no Production.
- [ ] `networks`: 4 docs, codes `hombres` / `mujeres` / `jovenes` / `ninos`.
- [ ] `districts`: 50 docs, `metroArea = "Lima Metropolitana"`.
- [ ] `roles`: 4 docs (`superadmin`, `leader_general`, `leader`, `staff`). Cero filas en `users` y `userRoleAssignments`.
- [ ] `permissions`: 62 docs.
- [ ] `rolePermissions`: una fila por entrada del mapa; sin duplicados `(roleId, permissionId)`.
- [ ] Vacías: `ministries`, `persons`, `users`, `cells`, `personLeadership`, `trainingPrograms` / modules / cycles.
- [ ] Logs: `Finished running function "seed:bootstrapPreview"` solo en el **primer** deploy de un preview nuevo.
- [ ] Rebuild de la misma rama: funciones se actualizan, conteos de catálogo no se duplican, `--preview-run` no vuelve a correr.
- [ ] Production: mismas tablas intactas; ningún log de `bootstrapPreview`.

---

## G. Riesgos

| Riesgo | Realidad | Mitigación |
| --- | --- | --- |
| Tocar Production vía `--preview-run` | El flag se ignora con Production key | No cambiar Production Branch ni su deploy key |
| Production key en Vercel Preview | El CLI 1.44 aborta el deploy | Dejar `--check-build-environment` en default |
| Mutation pública | Cualquiera con la URL Convex del preview podría re-sembrar | **No hacerla pública** |
| `ALLOW_PREVIEW_BOOTSTRAP=true` copiado a Production | Un admin `convex run seed:bootstrapPreview --prod` sí sembraría prod | Nunca setear esa env en Production; fail-closed |
| `seed:seedCatalogs --prod` | Sigue existiendo sin guarda | No apuntar `--preview-run` a ella; no correrla a mano contra prod |
| Duplicar datos | Índices únicos + lookup previo | Rebuilds no re-ejecutan `--preview-run` |
| Privilegio superadmin | Solo el **rol** de catálogo; cero usuarios | No llamar `authz:seedSuperadminRole` |
| Overwrite de catálogos custom | Re-run parchea names/`isActive` de networks/roles/permissions | Aceptable en preview vacío; no usar en prod |
| Preview actual vacío | `--preview-run` no backfillea previews ya creados | One-shot autenticado después de aprobar, o rama nueva |
| Env ausente en preview nuevo | Seed falla post-push; rebuild no reintenta | Setear Preview defaults **antes** del Build Command |
| Clerk / formation | Fuera de esta función | No incluirlos |

---

## Estado

Fase de análisis cerrada. Este documento no autoriza commit de código de bootstrap, seed, deploy ni cambio de Production.

Cuando se apruebe de forma explícita:

1. Implementar el diff de `convex/seed.ts`.
2. Documentar / setear `ALLOW_PREVIEW_BOOTSTRAP=true` en Preview defaults.
3. Cambiar el Build Command de Vercel.
4. Backfill de `merry-kookaburra-415` como paso aparte, también sujeto a aprobación.
