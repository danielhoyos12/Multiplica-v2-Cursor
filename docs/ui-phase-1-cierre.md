# MULTIPLICA — UI Refresh Phase 1 · Reporte de cierre

**Neo Editorial + navegación por Escalera del Éxito**

| Campo | Valor |
| --- | --- |
| Estado | **CODE COMPLETE** — pendiente aprobación humana |
| Branch | `cursor/ui-neo-editorial-navigation-a3cc` |
| Base | `main` (incluye Fase 10 mergeada) |
| PR | https://github.com/danielhoyos12/Multiplica-v2-Cursor/pull/13 |
| Commit | `fcb7a17` (+ commit de este reporte) |
| Fecha | 2026-08-16 |
| Alcance | Solo UI shell / tokens / navegación |

---

## 1. Resumen ejecutivo

Se aplicó de forma progresiva la identidad visual **Neo Editorial** sobre el monolito Next.js existente, sin reconstruir el sistema y sin tocar dominio pastoral.

Entregado:

1. Tokens oficiales Neo Editorial
2. Tipografía Archivo + Inter
3. Canvas Rice Paper (`#F3F0E8`)
4. Floating Sidebar desktop (≥1180px)
5. Bottom Dock tablet/móvil (&lt;1180px)
6. Navegación semántica por Escalera del Éxito (01–04)
7. Operación / Admin / Legacy preservados
8. Rutas existentes intactas
9. Cero cambios DB / migraciones / RLS / authz / services

**No merge. No producción.** Esperar aprobación humana.

---

## 2. Principio de no-regresión

| Restricción | Cumplido |
| --- | --- |
| No reconstruir arquitectura | Sí |
| No cambiar rutas pastorales | Sí |
| No cambiar DB / migraciones / RLS | Sí |
| No cambiar authz / permisos / servicios | Sí |
| No eliminar funcionalidad | Sí |
| No rediseñar dashboard interno (Phase 2) | Sí |
| No inventar rutas de Consolidar | Sí (`/proceso`) |

---

## 3. Branch y working tree (pre-cambio)

Al inicio de la fase:

1. `main` actualizado (Fase 10 integrada)
2. Working tree limpio (salvo `AGENTS.md` / `CLAUDE.md` no trackeados)
3. Branch creada: `cursor/ui-neo-editorial-navigation-a3cc`

Archivos identificados como gobernadores visuales:

- `src/app/globals.css` — tokens
- `src/app/layout.tsx` — fuentes
- `src/components/layout/app-shell.tsx`
- `src/components/layout/app-sidebar.tsx`
- `src/components/layout/brand-mark.tsx`

---

## 4. Archivos modificados

| Archivo | Cambio |
| --- | --- |
| `src/app/globals.css` | Tokens Neo Editorial, radii, shadows, motion, focus, reduced-motion |
| `src/app/layout.tsx` | Manrope/Fraunces → **Inter** / **Archivo** |
| `src/components/layout/app-shell.tsx` | Canvas rice; rail gutter fijo; dock padding; sin gradientes verdes |
| `src/components/layout/app-sidebar.tsx` | Floating sidebar ink + overlay expandido Escalera |
| `src/components/layout/brand-mark.tsx` | Mark + wordmark; variante inverse |
| `src/app/(auth)/login/page.tsx` | Fondo rice; sin gradiente verde |
| `src/app/(auth)/recuperar/page.tsx` | Fondo rice + display font |
| `src/app/(public)/ganar/registro/page.tsx` | Fondo rice (sin radial verde) |

---

## 5. Archivos nuevos

| Archivo | Propósito |
| --- | --- |
| `src/components/layout/bottom-dock.tsx` | Dock 5 ítems + sheets Ruta/Equipos/Más |
| `src/components/layout/nav-config.ts` | Modelo Escalera + secundarios (solo rutas existentes) |
| `src/components/layout/nav-icons.tsx` | Iconografía SVG inline (sin dependencia pesada) |
| `public/brand/m-mark.svg` | Slot Brand Kit (stand-in tipográfico temporal) |
| `public/brand/README.md` | Instrucciones para reemplazar mark oficial |
| `src/app/ui-preview/page.tsx` | Harness visual (solo `development` / `MULTIPLICA_UI_PREVIEW=1`) |
| `scripts/ui-phase1-screenshots.mjs` | Capturas Playwright multi-viewport |
| `docs/ui-phase-1-cierre.md` | Este reporte |

---

## 6. Tokens implementados

| Token | Valor |
| --- | --- |
| Ink | `#111111` |
| Ink secondary | `#292927` |
| Muted | `#5F5F5A` |
| Rice Paper / page-bg | `#F3F0E8` |
| Surface | `#FFFFFF` |
| Border | `#D4D2CA` |
| Vermilion | `#E33B24` |
| Vermilion dark | `#C92E1B` |
| Cobalt | `#3157FF` |
| Cobalt dark | `#2343D6` |
| Success | `#176B52` |
| Warning | `#9A5B00` |
| Radius sm/md/lg/pill | 6 / 10 / 16 / 999 |
| Shadow float | `0 12px 36px rgba(17,17,17,.14)` |
| Shadow card | `0 1px 0 rgba(17,17,17,.08)` |
| Focus | Cobalt 2px + offset 3px |
| Motion | 120ms / 200ms · `cubic-bezier(.2,.8,.2,1)` |
| Sidebar | 72 / 272 · inset 16px |
| Dock | 64px + `safe-area-inset-bottom` |
| Content max | 1440px |
| Desktop breakpoint | 1180px |
| Touch min | 44px |

Compatibilidad: `--brand` / `--brand-ink` / `--brand-soft` aliasan a cobalto/ink para no romper páginas existentes.

---

## 7. Tipografía

| Rol | Antes | Ahora |
| --- | --- | --- |
| Display / headings | Fraunces | **Archivo** (`--font-display`) |
| UI / body | Manrope | **Inter** (`--font-sans`) |

Fuente: `next/font/google`.

---

## 8. Brand assets

- Ruta estable: `/brand/m-mark.svg`
- **Warning:** el Brand Kit oficial no estaba en el repositorio.
- El SVG actual es un **stand-in tipográfico (letra M)** — no una reinterpretación del monograma aprobado.
- Acción humana: reemplazar `public/brand/m-mark.svg` por el SVG oficial sin cambiar el path.

---

## 9. Navegación Escalera del Éxito

Organización **solo visual/semántica**. Rutas existentes.

### 01 Ganar
- Personas → `/ganar`

### 02 Consolidar
- Pre-Encuentro → `/proceso`
- Encuentro → `/proceso`
- Post-Encuentro → `/proceso`

*(Sin rutas nuevas; el visualizador existente es la entrada.)*

### 03 Discipular
- Capacitación Destino → `/destino` *(copy exacto, no “Destino”)*
- Re-Encuentro → `/reencuentro`
- Escuela Ministerial → `/escuela-ministerial`

### 04 Enviar
- Resumen / Enviar → `/enviar`
- Células → `/celulas`
- Liderazgo → `/liderazgo`

*(Submódulos operativos; no pasos secuenciales. Dominio: Enviar ≠ liderazgo activo.)*

### Secundaria
- **Operación:** Transferencias, Reportes  
- **Admin:** Ministerios, Redes, Usuarios, System Health  
- **Legacy:** UDV  

---

## 10. Desktop ≥1180 — Floating Sidebar

- Fondo ink `#111111`
- Separación viewport 16px · radius 16px
- Colapsado 72px · expandido 272px
- Expand = **overlay** (backdrop); **no** desplaza main
- Activo: cobalto + blanco
- Acento atención: vermellón (dot en rail)
- Tooltips en colapsado
- Perfil / logout anclados abajo del panel expandido
- Logo → `/dashboard`

Main mantiene gutter constante:  
`pl = sidebar-collapsed + inset×2`

---

## 11. Tablet / móvil &lt;1180 — Bottom Dock

Máximo 5 destinos:

| Ítem | Destino |
| --- | --- |
| Inicio | `/dashboard` |
| Personas | `/ganar` |
| Ruta | Sheet Escalera 01–04 |
| Equipos | Sheet Células / Liderazgo / Resumen Enviar |
| Más | Sheet Operación / Admin / Legacy + logout |

- Altura visual 64px + `env(safe-area-inset-bottom)`
- Activo cobalto
- Touch ≥44px
- Un solo dock; subnavegación vía bottom sheet

---

## 12. AppShell

- Canvas Rice Paper
- Content `max-width: 1440px`
- Padding inferior para no tapar acciones con el dock
- Gradientes verdes del shell **eliminados**
- Children / auth wiring del layout de app **sin cambios**

---

## 13. Rutas verificadas (compatibilidad)

Siguen existiendo y responden en build:

`/dashboard` · `/ganar` · `/celulas` · `/liderazgo` · `/proceso` · `/destino` · `/reencuentro` · `/escuela-ministerial` · `/enviar` · `/transferencias` · `/reportes` · `/admin/ministries` · `/admin/networks` · `/admin/users` · `/admin/system-health` · `/udv` · `/login` · `/recuperar` · `/ganar/registro`

Harness opcional: `/ui-preview` (solo development).

Sin redirects nuevos. Sin cambios de permisos ni role scope.

---

## 14. Quality gates

| Gate | Resultado |
| --- | --- |
| `npm run lint` | **PASS** |
| `npm run typecheck` | **PASS** |
| `npm test` | **PASS** (11 files / 129 tests) |
| `npm run build` | **PASS** |

---

## 15. Responsive / screenshots

Capturas en `/opt/cursor/artifacts/screenshots/`:

| Archivo | Viewport / escena |
| --- | --- |
| `login-1440.png` | Login desktop |
| `login-390.png` | Login móvil |
| `registro-430.png` | Formulario público GANAR |
| `shell-1440.png` | Sidebar colapsado |
| `shell-expanded-1440.png` | Sidebar expandido Escalera |
| `shell-1180.png` | Boundary desktop |
| `shell-1024.png` | iPad landscape-ish |
| `shell-834.png` | iPad portrait |
| `shell-430.png` | Mobile + dock |
| `shell-360.png` | Mobile estrecho |
| `shell-ruta-sheet-430.png` | Sheet Ruta pastoral |
| `shell-equipos-sheet-430.png` | Sheet Equipos |
| `shell-iphone-mas.png` | Sheet Más (iPhone 13) |

Revisiones hechas:

- Sin scroll horizontal evidente en harness
- Overlay sidebar no desplaza main
- Dock no tapa el contenido (padding inferior)
- Active route / sheets / logout visibles en preview
- `prefers-reduced-motion` respetado en CSS global

---

## 16. Criterios de aceptación Phase 1

| # | Criterio | Estado |
| --- | --- | --- |
| 1 | Tokens Neo Editorial | PASS |
| 2 | Archivo + Inter | PASS |
| 3 | Brand assets path oficial | PASS (stand-in documentado) |
| 4 | Canvas Rice Paper | PASS |
| 5 | Floating Sidebar desktop | PASS |
| 6 | Overlay sin layout shift | PASS |
| 7 | Bottom Dock tablet/mobile | PASS |
| 8 | Safe area móvil | PASS |
| 9 | Nav Escalera 01–04 copy correcto | PASS |
| 10 | Secundarios preservados | PASS |
| 11 | Rutas existentes | PASS |
| 12 | Sin cambio dominio | PASS |
| 13 | Sin migración | PASS |
| 14 | Sin cambio RLS | PASS |
| 15 | Sin cambio datos | PASS |

---

## 17. Warnings

1. **Brand Kit SVG oficial ausente** en repo → stand-in tipográfico en `public/brand/m-mark.svg`.
2. `/ui-preview` es harness de desarrollo; no usar en producción.
3. Ítems de Consolidar (Pre/Enc/Post) apuntan todos a `/proceso` a propósito (sin rutas separadas).
4. Páginas internas (KPIs, tablas, forms) heredan tokens/fuentes pero **no** están rediseñadas.

---

## 18. Deuda Phase 2 (explícita)

No hacer todavía (fuera de Phase 1):

- Dashboard Neo Editorial completo (KPIs, densidad, charts)
- Rediseño de tablas / cards / empty states de módulos
- Formularios Ganar / células / liderazgo / transferencias / reportes
- Sustitución del mark tipográfico por SVG Brand Kit oficial
- Refinar iconografía / badges de atención reales (conteos)
- Auditar contraste WCAG página por página post-rediseño de contenido
- Quitar o restringir más `/ui-preview` si se prefiere cero harness en main

---

## 19. FigJam / Figma notes

Cambios visuales a reflejar en design ops:

- Floating ink sidebar + overlay expand
- Bottom dock 5 slots + sheets
- Labels Escalera (Capacitación Destino exacto)
- Login/registro sin verde
- Tipografía Archivo/Inter

---

## 20. Acciones humanas pendientes

1. Revisar PR #13 y screenshots
2. Entregar SVG oficial del monograma M → `public/brand/m-mark.svg`
3. Aprobar merge (humano)
4. Autorizar Phase 2 (dashboard / superficies internas)

---

## 21. Conclusión

**UI Phase 1 = PASS técnico**  
**Readiness visual shell = listo para revisión humana**  
**Phase 2 = no iniciado**  
**Producción = no autorizada por este agente**
