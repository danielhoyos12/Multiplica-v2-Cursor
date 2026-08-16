# MULTIPLICA — Hotfix follow-up PR #18
# Fix runtime error on recovery password gate

| Campo | Valor |
| --- | --- |
| Branch | `cursor/hotfix-recovery-password-gate-runtime-a3cc` |
| Base | `staging` (post PR #18 @ `e5b0426`) |
| PR | https://github.com/danielhoyos12/Multiplica-v2-Cursor/pull/19 |
| Commits | `857c9b5` fix(auth): stop mutating cookies in AuthenticatedLayout render |
| Follow-up de | PR #18 |
| Merge | **NO** |
| Producción | **NO** |

---

## Root cause confirmado

En `src/app/(app)/layout.tsx` (PR #18) se llamaba:

```ts
const cookieStore = await cookies();
cookieStore.set(MUST_CHANGE_PASSWORD_COOKIE, "1", ...);
```

y también `supabase.auth.updateUser(...)` **durante el render** del Server Component.

Eso provoca el Error boundary en `/cuenta/cambiar-password` tras un recovery
exitosamente autenticado (Auth logs PASS; falla en Next render).

`/auth/callback` ya establecía correctamente DB + metadata + cookie antes del redirect.

---

## Diff exacto (comportamiento)

### `src/app/(app)/layout.tsx`
- **Eliminado:** `cookies().set(...)`
- **Eliminado:** `updateUser({ data: { must_change_password: true } })`
- **Mantiene:** lectura DB `must_change_password` como fuente de verdad
- **Mantiene:** redirect a change-password + `PasswordGateShell` (sin sidebar/dock)

### `src/server/supabase/middleware.ts`
- Si gate activo, puede **setear cookie en la Response** (permitido en middleware)
- Redirects a change-password siguen activos

### Sin cambios de contrato en
- `/auth/callback` (sigue SET cookie + DB + metadata)
- `clearMustChangePasswordAction` (sigue CLEAR)
- form de cambio de contraseña

---

## Flujo esperado (tras fix)

1. Recovery callback → session + DB true + metadata true + cookie=1 → redirect change-password  
2. Layout read-only → PasswordGateShell **sin error**  
3. Direct URL `/dashboard` `/ganar` `/admin/users` `/reportes` → middleware redirect  
4. Guardar password → clear gate → dashboard normal  

---

## Tests

- Layout source **no** contiene `cookieStore.set` / `updateUser`
- Callback **sí** setea cookie + flags
- Clear action limpia gate
- Allowlist / blocklist rutas
- PasswordGateShell exportado

## Gates

| Gate | Resultado |
| --- | --- |
| lint | **PASS** |
| typecheck | **PASS** |
| test | **PASS** — 161 |
| build | **PASS** |

---

**RECOVERY PASSWORD GATE RUNTIME FIX: READY FOR HUMAN REVIEW**
