# Fase 10 — Cierre (HARDENING / SEGURIDAD / E2E / UX / STAGING PREP)

## 1. Resumen

Fase 10 convierte MULTIPLICA (funcionalmente completo en Fases 0–9) en un **release candidate** endurecido: auth, secretos, RLS idempotente, verify release, CI, UX de seguridad, documentación operativa. **No** se añadieron workflows pastorales nuevos. **No** hay deploy a producción.

## 2. Branch

`cursor/phase-10-hardening-release-a3cc` (base: `main` con PR #11 Phase 9 mergeada).

## 3. Codebase baseline

- Next.js 16.3.1 · React 19 · TypeScript · Tailwind · Supabase · Drizzle
- Versión package: `1.0.0-rc.1`
- Migraciones: `0000`–`0010` (sin editar retrospectivamente)

## 4. Security hardening

- Headers: nosniff, Referrer-Policy, Permissions-Policy, X-Frame-Options
- Open-redirect defense (`safeInternalPath`)
- Prod-guard en verify scripts
- Secret scan en verify-phase10 (src JWT-like + `.next/static` vs live secrets)
- Service role boundary: server-only env

## 5. Auth / password

- `must_change_password` **forzado** (layout + allowlist de rutas)
- Inactive user blocked
- Forgot password `/recuperar` (mensaje neutro)
- Política: ≥10 chars, letra+número, evitar temporales obvios
- Login errors neutros

## 6. RLS audit

Matriz en `docs/security-rls-matrix.md`. Foundation policies con `DROP POLICY IF EXISTS`.

## 7. Secret audit

`.env.example` sin secretos reales. `.env*` ignorado excepto example. Bundle scan en verify.

## 8. Input / IDOR / boundaries

- Tests: `src/modules/security/security-boundaries.test.ts`
- Anonymous DENY checks en verify-phase10
- Mutaciones vía session actor (no actorId cliente)

## 9. Migrations

Sin DDL retrospectivo. Fixes vía nuevas migraciones solo si hicieran falta (ninguna estructural requerida en este cierre).

## 10. RLS pipeline

`scripts/apply-rls.sh` aplica 001–010; re-ejecutable; rechaza `APP_ENV=production`.

## 11. Seeds

Catálogos idempotentes existentes. Fixtures Phase* no van a seed de producción (documentado).

## 12. E2E

Playwright smoke (`e2e/smoke.spec.ts`): login UI, invalid login, public form, health. Proyectos chromium / iPhone / iPad. Live full pastoral E2E **pendiente de staging**.

## 13. Mobile / iPad

Viewports en Playwright config. Touch-friendly person search / forms (text-base inputs).

## 14. Accessibility

Labels en filtros dashboard; role=status password banner; focusable search buttons (no hover-only). Contraste: status badges + text (deuda C residual).

## 15. UX fixes

- Sidebar agrupada (Principal / Proceso / Operación / Admin / Legacy)
- Filtros ministerio/red por nombre
- Person search en célula, liderazgo, transferencias, enrollments
- Privacy notice placeholder en formulario público
- Empty state transferencias

## 16. Error handling

`error.tsx` / `global-error` / `not-found` / `loading`; `userFacingErrorMessage` mapea códigos.

## 17. Logging

Audit ≠ error log (documentado). Redacción de DB/password en mensajes usuario.

## 18. Health

`/api/health` liveness; `/api/ready` DB `select 1` sin secretos.

## 19. Performance

Sin SLA inventado. Baseline a medir en staging. N+1 evidentes: deuda B post-go-live si aparece en staging.

## 20. npm audit

4 **moderate** vía `esbuild` (drizzle-kit). No `audit fix --force` (breaking). Aceptado para RC; revisar al actualizar drizzle-kit.

## 21. CI

`.github/workflows/ci.yml`: npm ci, lint, typecheck, test, build; audit report-only. Live verify separado/manual.

## 22. Staging

**STAGING_PENDING** — no se desplegó staging en este run (faltan proyecto Supabase staging + Vercel credentials).

## 23. Supabase staging plan

Documentado en deployment-rollback / go-live: project separado → migrate → RLS → seed catalogs → Auth URLs → bootstrap superadmin.

## 24. Vercel

Build: `npm run build` con Node 20. Env list en `.env.example`. Preview deploys al conectar GitHub.

## 25. Backups

`docs/backup-restore.md`

## 26. Restore drill

No destructivo sobre multiplica-dev. Procedimiento documentado (dump → DB temporal → invariants).

## 27. Runbooks

operations · backup · rollback · go-live · UAT · security

## 28. UAT

`docs/uat-checklist.md` listo para humano en staging.

## 29. System health

`CRITICAL_FAIL=1 npm run verify:invariants` contra multiplica-dev: **critical=0 warning=0** (2026-08-15).

## 30. Verify release

`scripts/verify-phase10-release.ts`: **PASS=15 FAIL=0** (anon DENY, secret scan, redirects, CSV sanitize, health).

## 31. PASS/FAIL (código)

| Gate | Status |
| --- | --- |
| lint / typecheck / unit (129) | PASS |
| build | PASS |
| Invariants critical=0 | PASS |
| verify-phase10 | PASS |
| E2E full pastoral | PENDING staging |
| Staging deploy | PENDING |
| Production | NOT STARTED |

## 32. Blockers

| Clase | Item |
| --- | --- |
| A (staging) | Staging no desplegado → no STAGING_READY |
| B | SMTP prod/staging no verificado → reset email end-to-end pendiente |
| B | CSP estricto no cerrado (warning documentado) |
| B | npm audit moderate esbuild |
| C | Middleware→proxy rename Next 16 (warning conocido; middleware sigue vigente) |
| C | Print / dirty-form global / Sentry |

## 33. Post-go-live debt

Performance EXPLAIN, CSP endurecida, observability Sentry, UAT formal, custom domain.

## 34. Final readiness status

# **CODE_READY**

(+ STAGING_PENDING)

No `PRODUCTION_APPROVED` (requiere aprobación humana explícita).

## FigJam / Figma notes (visual)

- Sidebar groups
- Person search pickers
- Dashboard name filters
- Forgot-password link
- Public privacy blurb
- Password gate banner

## Acceptance (fase)

Cumple criterios de código/seguridad/docs listados en el brief; staging/E2E live y producción quedan como gates humanos siguientes.
