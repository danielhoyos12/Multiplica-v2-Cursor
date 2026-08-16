# MULTIPLICA — Convex local development setup

| Campo | Valor |
| --- | --- |
| Fecha | 2026-08-16 |
| Branch | `cursor/convex-local-dev-a3cc` |
| Base | `staging` |
| Modo | `CONVEX_AGENT_MODE=anonymous` (sin cuenta Convex cloud) |
| Decisión backend | **FULL_CUTOVER → Convex** (ver `docs/convex-full-cutover-plan.md`) |
| Pastoral data hoy | **Aún Supabase/Drizzle** hasta fases de cutover |

---

## Resultado

**Convex local listo** + **fase 0** (schema foundation). El UI pastoral sigue en Postgres.

| Ítem | Estado |
| --- | --- |
| Dep `convex` + scripts `convex:dev` / `convex:once` / `convex:dashboard` | ✅ |
| Schema foundation (districts/networks/ministries/persons/users/roles/…) | ✅ |
| Smoke `healthChecks` + `/convex-dev` | ✅ |
| Indicador fijo esquina (verde/rojo websocket) | ✅ |
| Provider global de la app pastoral | ❌ hasta migrar dominios |

---

## Cómo correrlo

```bash
npm run convex:dev   # terminal 1 — backend local :3210
npm run dev          # terminal 2 — Next
# abrir http://localhost:3000/convex-dev
```

---

## Archivos clave

- `convex/schema.ts`, `convex/health.ts`, `convex/foundation.ts`, `convex/_generated/*`
- `src/components/convex/*`, `src/app/convex-dev/page.tsx`
- `docs/convex-full-cutover-plan.md`

---

**CONVEX LOCAL DEV: READY**  
**FULL_CUTOVER: PHASE 0 (SCHEMA + PLAN)**  
**LIVE DATA: STILL SUPABASE/DRIZZLE**
