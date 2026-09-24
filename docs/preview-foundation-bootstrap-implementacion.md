# MULTIPLICA — Implementación `seed:bootstrapPreview`

| Campo | Valor |
| --- | --- |
| Fecha | 2026-08-17 |
| Branch | `cursor/convex-pastoral-cutover-a3cc` |
| PR | [#23](https://github.com/danielhoyos12/Multiplica-v2-Cursor/pull/23) — draft, **no mergeado** |
| Base | `staging` |
| Commit de implementación | `56dca7bdb637745f23769f8e9e3f2e77546bfbc0` |
| Análisis previo | [`docs/preview-foundation-bootstrap.md`](preview-foundation-bootstrap.md) |

---

## Archivos modificados

| Archivo | Cambio |
| --- | --- |
| `convex/lib/seedFoundation.ts` | **Nuevo.** `seedFoundationCatalogs`, helpers de catálogo, `assertPreviewBootstrapAllowed`. |
| `convex/seed.ts` | Wrappers `internalMutation`: `seedCatalogs` (igual que antes) y `bootstrapPreview` (Preview-only). |
| `src/modules/security/preview-bootstrap.test.ts` | **Nuevo.** Contratos internal-only, guarda env, alcance de tablas, reuso, idempotencia. |
| `src/modules/security/clerk-convex-hardening.test.ts` | El contrato de seeds internal-only incluye `bootstrapPreview`. |

No se modificó `package.json`, Vercel Build Command, variables Convex, Clerk, formation, ni Production.

---

## Diff resumido

- Extraída la lógica de `seedNetworks` / `seedDistricts` / `seedRoles` / `seedPermissions` / `seedRolePermissions` a `seedFoundationCatalogs`.
- `seed:seedCatalogs` sigue siendo `internalMutation` con `args: {}` y llama `seedFoundationCatalogs(ctx)` **sin** la guarda Preview (uso local / CLI).
- `seed:bootstrapPreview` es `internalMutation` con `args: {}`. Exige `ALLOW_PREVIEW_BOOTSTRAP === "true"` y reutiliza `seedFoundationCatalogs`.
- Tablas sembradas: `networks`, `districts`, `roles`, `permissions`, `rolePermissions`.
- No inserta `ministries`, `persons`, `users`, `userRoleAssignments`.
- No llama Clerk, formation, ni otros seeds.

---

## Commit SHA

```
56dca7bdb637745f23769f8e9e3f2e77546bfbc0
```

Mensaje: `feat(convex): add Preview-only seed:bootstrapPreview`

---

## Resultados de calidad

Ejecutado en esta VM **después** del cambio de código, **antes** de cualquier seed/deploy:

| Check | Comando | Resultado |
| --- | --- | --- |
| lint | `npm run lint` | **PASS** |
| typecheck | `npm run typecheck` | **PASS** |
| tests | `npm test` (`vitest run`) | **PASS** — 17 files, **181** tests |
| build | `npm run build` | **PASS** — Next.js 16.3.1 |

No se ejecutó `npx convex run`. No se ejecutó `npx convex deploy`.

---

## Confirmación explícita

**No se escribió ningún dato en Convex.**

- No se ejecutó `seed:bootstrapPreview`.
- No se ejecutó `seed:seedCatalogs`.
- No se hizo backfill de `merry-kookaburra-415`.
- No se cambiaron variables de entorno de Convex Dashboard.
- No se cambió el Build Command de Vercel.
- **No se tocó Production.**
- No se mergeó PR #23 (permanece draft sobre `staging`).

Los tests de idempotencia usan un `MutationCtx` **in-memory** en Vitest; no hablan con el deployment preview ni con Production.

---

## Pendiente (HUMAN / aprobación posterior)

1. Setear `ALLOW_PREVIEW_BOOTSTRAP=true` **solo** en Preview defaults de Convex.
2. Cambiar el Build Command de Vercel a:

   ```bash
   npx convex deploy --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL --cmd 'npm run build' --preview-run 'seed:bootstrapPreview'
   ```

3. Backfill one-shot de `merry-kookaburra-415` (ese preview ya existe; `--preview-run` no corre en rebuilds).
