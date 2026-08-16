# MULTIPLICA — Hotfix: Recovery / First Login Must Block App Navigation

| Campo | Valor |
| --- | --- |
| Branch | `cursor/hotfix-recovery-password-gate-a3cc` |
| Base | `origin/staging` (= `main` @ `24fbb95`) |
| PR | https://github.com/danielhoyos12/Multiplica-v2-Cursor/pull/18 |
| Commits | `599148c` fix(auth): block app nav until password change completes |
| Merge | **NO** |
| Producción | **NO** |
| Base PR | `staging` (UAT) |

---

## Root cause

1. Flujo “Olvidaste tu contraseña” → email → `/auth/callback?next=/cuenta/cambiar-password` crea **sesión válida**.
2. **No** se activaba `users.must_change_password` en recovery (solo en provision de liderazgo).
3. El layout `(app)` montaba **AppShell** (sidebar + dock) aunque el copy dijera “Primer ingreso”.
4. El middleware solo exigía sesión, **no** el gate de cambio de contraseña → navegación libre a `/dashboard`, `/ganar`, etc.

Fuente de verdad reutilizada: columna existente `users.must_change_password` (+ sync a `user_metadata.must_change_password` y cookie `multiplica_pcg` para middleware). **Sin migración nueva.**

---

## Protección server-side

| Capa | Comportamiento |
| --- | --- |
| Middleware | Si cookie/metadata gate activo y path no allowlisted → redirect `/cuenta/cambiar-password` |
| Layout `(app)` | Si DB `must_change_password` → redirect + **PasswordGateShell** (sin sidebar/dock) |
| Auth callback | Si `next` es change-password → set DB + metadata + cookie |
| Clear gate | Tras `updateUser(password)` → clear DB + metadata + cookie → `/dashboard` |

Allowlist: `/cuenta/cambiar-password`, `/login`, `/auth/*`, `/api/health`, `/api/ready`. Logout permitido desde shell mínimo.

---

## Archivos modificados / nuevos

- `src/lib/password-change-gate.ts` (nuevo)
- `src/components/layout/password-gate-shell.tsx` (nuevo)
- `src/server/supabase/middleware.ts`
- `src/app/auth/callback/route.ts`
- `src/app/(app)/layout.tsx`
- `src/modules/leadership/password-actions.ts`
- `src/components/leadership/change-password-form.tsx`
- `src/app/(app)/cuenta/cambiar-password/page.tsx`
- `src/server/actions/auth.ts`
- `src/modules/security/password-change-gate.test.ts` (nuevo)
- `docs/hotfix-recovery-password-gate.md` (este archivo)

---

## Tests

- Unit: gate metadata/cookie + blocklist rutas pastorales/admin
- Existentes allowlist en `security-boundaries.test.ts` mantenidos

## Gates

| Gate | Resultado |
| --- | --- |
| lint | **PASS** |
| typecheck | **PASS** |
| test | **PASS** — 152 |
| build | **PASS** |

## Reproducir en staging (tras deploy del hotfix)

1. Olvidar contraseña → email → Reset password.
2. Llegar a “Cambiar contraseña” con sesión.
3. Abrir sidebar → **no debe existir**.
4. Ir manualmente a `/dashboard`, `/ganar`, `/admin/users`, `/reportes` → **redirect** a `/cuenta/cambiar-password`.
5. Guardar contraseña válida → `/dashboard` con AppShell normal.
6. Login normal sin gate → sin regresión.

## No-regresión

Login normal, roles, scopes, RLS, DB schema, navegación post-cambio: intactos.

---

**RECOVERY NAVIGATION BLOCK: READY FOR HUMAN REVIEW**
