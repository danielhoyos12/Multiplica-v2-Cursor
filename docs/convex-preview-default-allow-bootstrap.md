# MULTIPLICA — Configuración Preview default `ALLOW_PREVIEW_BOOTSTRAP`

| Campo | Valor |
| --- | --- |
| Fecha | 2026-08-18 |
| Branch | `cursor/convex-pastoral-cutover-a3cc` |
| Proyecto Convex | `convex-bistre-kettle` |
| Preview actual | `merry-kookaburra-415` |
| Convex CLI | **1.44.0** (instalado en el repo) |
| Resultado | **BLOQUEADO** — sin autenticación Convex en la VM |

---

## Objetivo

Configurar **únicamente** el default de entorno de Convex para **Preview deployments**:

```
ALLOW_PREVIEW_BOOTSTRAP=true
```

Sin modificar Development defaults, Production defaults, Production deployment, Vercel, Clerk, seeds, deploys, ni archivos de aplicación.

---

## 1. Comando exacto (sintaxis verificada en Convex 1.44.0)

Verificado con `npx convex env --help` y `npx convex env default set --help`.

### Set (Preview defaults only)

```bash
npx convex env default set ALLOW_PREVIEW_BOOTSTRAP true --type preview --project convex-bistre-kettle
```

Notas de sintaxis:

- `--type preview` (minúsculas; acepta `dev`, `preview`, `prod`).
- `--project` **requiere** `--type`.
- `--project` acepta `project-slug` o `team-slug:project-slug`.
- El valor es el string literal `true` (coincide con la guarda en código: `=== "true"`).

### Verificación (después de autenticarse)

```bash
npx convex env default get ALLOW_PREVIEW_BOOTSTRAP --type preview --project convex-bistre-kettle
npx convex env default get ALLOW_PREVIEW_BOOTSTRAP --type prod --project convex-bistre-kettle
npx convex env default get ALLOW_PREVIEW_BOOTSTRAP --type dev --project convex-bistre-kettle
```

### ¿Soporta defaults separados por tipo?

**Sí.** Convex 1.44.0 expone `--type` en `env default set|get|list|remove`. No hace falta workaround global.

---

## 2. Resultado de la operación

**No se ejecutó el set.** La VM no está autenticada contra Convex Cloud.

### Intento de lectura (sin modificar nada)

```bash
npx convex env default get ALLOW_PREVIEW_BOOTSTRAP --type preview --project convex-bistre-kettle
```

Salida:

```text
✖ Error fetching GET  https://api.convex.dev/api/deployment/anonymous-agent/team_and_project
401 Unauthorized: MissingAccessToken: An access token is required for this command.
Authenticate with `npx convex dev`
```

### Estado de autenticación en la VM

```bash
npx convex login status
```

```text
No Convex account token found in: /home/ubuntu/.convex/config.json
Status: Not logged in
```

| Credencial / sesión | Estado |
| --- | --- |
| `CONVEX_ACCESS_TOKEN` | no definida |
| `CONVEX_DEPLOY_KEY` | no definida |
| `~/.convex/config.json` | **no existe** |
| `npx convex login status` | **Not logged in** |
| `.env.local` → `CONVEX_DEPLOYMENT` | `anonymous:anonymous-agent` (local; no sirve para `env default` cloud) |

### Autenticación requerida

**Personal access token** de cuenta Convex vía `npx convex login` (persistido en `~/.convex/config.json`).

`env default` opera a nivel **proyecto** en Convex Cloud. No basta con:

- Preview Deploy Key (`CONVEX_DEPLOY_KEY`)
- deployment anónimo local
- credenciales de Production (no usadas ni intentadas)

No se probaron alternativas inseguras ni credenciales de Production.

---

## 3. Valor / situación por scope

| Scope | `ALLOW_PREVIEW_BOOTSTRAP` | Estado |
| --- | --- | --- |
| **Preview defaults** | desconocido | **No verificado ni modificado** |
| **Production defaults** | desconocido | **No verificado ni modificado** |
| **Development defaults** | desconocido | **No verificado ni modificado** |
| Preview existente `merry-kookaburra-415` | desconocido | **No consultado ni modificado** |

Los **project defaults** de Preview aplican a **futuros** preview deployments. Un preview ya creado puede seguir sin la variable hasta un `env set` en ese deployment o hasta que herede defaults en un redeploy (según comportamiento de Convex).

---

## 4. Confirmaciones explícitas

- **No** se ejecutó ningún seed (`seed:bootstrapPreview`, `seed:seedCatalogs`, etc.).
- **No** se ejecutó ningún deploy (`npx convex deploy`).
- **No** se modificó Production (ni defaults ni deployment).
- **No** se modificó Vercel.
- **No** se modificó Clerk.
- **No** se modificó código de aplicación en esta operación.
- **No** se imprimieron deploy keys, access tokens ni otras credenciales.

---

## 5. Próximo paso (HUMAN)

En una máquina con sesión Convex autenticada:

```bash
npx convex login
npx convex env default set ALLOW_PREVIEW_BOOTSTRAP true --type preview --project convex-bistre-kettle
npx convex env default get ALLOW_PREVIEW_BOOTSTRAP --type preview --project convex-bistre-kettle
npx convex env default get ALLOW_PREVIEW_BOOTSTRAP --type prod --project convex-bistre-kettle
npx convex env default get ALLOW_PREVIEW_BOOTSTRAP --type dev --project convex-bistre-kettle
```

Si `--project convex-bistre-kettle` no resuelve el team, usar `team-slug:convex-bistre-kettle` (visible en Convex Dashboard → Project Settings).

Para el preview **ya existente** `merry-kookaburra-415`, evaluar aparte si hace falta:

```bash
npx convex env set ALLOW_PREVIEW_BOOTSTRAP true --deployment merry-kookaburra-415
```

(solo con aprobación explícita; fuera del alcance de “defaults Preview”).

---

## Referencias

- Análisis bootstrap: [`docs/preview-foundation-bootstrap.md`](preview-foundation-bootstrap.md)
- Implementación código: [`docs/preview-foundation-bootstrap-implementacion.md`](preview-foundation-bootstrap-implementacion.md)
