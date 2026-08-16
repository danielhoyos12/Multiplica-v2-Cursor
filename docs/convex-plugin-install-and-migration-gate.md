# MULTIPLICA — Convex plugin install + backend migration gate

| Campo | Valor |
| --- | --- |
| Fecha | 2026-08-16 |
| Entorno | Cloud Agent |
| Plugin Marketplace | **No disponible** en Cloud Agents (install manual ✅) |
| Decisión backend | **FULL_CUTOVER → Convex** |

---

## 1. Plugin Convex

| Acción | Estado |
| --- | --- |
| Rules / commands / MCP manual | ✅ |
| `convex` npm + `convex:dev` anonymous local | ✅ |
| Cloud `CONVEX_DEPLOY_KEY` | Solo cuando haya deploy cloud |

---

## 2. Decisión de producto

Preferencia confirmada: **Convex** por tipado TypeScript end-to-end y realtime, frente al stack actual Supabase Auth + Postgres + Drizzle (a veces llamado “T3” de forma informal; aquí no hay tRPC/Prisma).

| Opción | Estado |
| --- | --- |
| `SPIKE` | ✅ hecho (local + `/convex-dev`) |
| `FULL_CUTOVER` | ✅ **aceptado** — ver `docs/convex-full-cutover-plan.md` |
| Fase 0 | ✅ schema foundation + plan (Postgres pastoral aún soT) |

---

## 3. Guardrails

- No cutover a **producción** sin UAT en `staging`.
- Supabase Auth permanece hasta fase 10.
- Un writer por dominio (sin dual-write en closure/transfers).

---

**CONVEX: TARGET BACKEND**  
**PHASE 0: FOUNDATION SCHEMA + PLAN**  
**LIVE PASTORAL DATA: STILL SUPABASE/DRIZZLE**
