/**
 * System integrity checks — read-only. No auto-repair.
 */
import { sql } from "drizzle-orm";

import { getDb } from "@/db/client";

export type IntegrityViolation = {
  code: string;
  severity: "critical" | "warning";
  title: string;
  count: number;
  sampleIds: string[];
};

export type IntegrityReport = {
  checkedAt: string;
  violations: IntegrityViolation[];
  criticalCount: number;
  warningCount: number;
  healthy: boolean;
};

async function runCount(
  query: ReturnType<typeof sql>,
): Promise<{ count: number; sampleIds: string[] }> {
  const db = getDb();
  const rows = await db.execute<{ id: string }>(query);
  const list = Array.isArray(rows) ? rows : ((rows as { rows?: typeof rows }).rows ?? []);
  const ids = (list as Array<{ id: string }>).map((r) => r.id);
  return { count: ids.length, sampleIds: ids.slice(0, 10) };
}

export async function runIntegrityChecks(): Promise<IntegrityReport> {
  const violations: IntegrityViolation[] = [];

  const checks: Array<{
    code: string;
    severity: "critical" | "warning";
    title: string;
    query: ReturnType<typeof sql>;
  }> = [
    {
      code: "active_leader_without_cell",
      severity: "critical",
      title: "Líderes active sin célula abierta",
      query: sql`
        SELECT pl.person_id AS id
        FROM person_leadership pl
        WHERE pl.status = 'active'
          AND NOT EXISTS (
            SELECT 1 FROM cells c
            WHERE c.responsible_person_id = pl.person_id AND c.status <> 'closed'
          )
        LIMIT 50
      `,
    },
    {
      code: "more_than_two_direct_cells",
      severity: "critical",
      title: "Responsables con más de 2 células directas",
      query: sql`
        SELECT responsible_person_id AS id
        FROM cells
        WHERE status <> 'closed' AND responsible_person_id IS NOT NULL
        GROUP BY responsible_person_id
        HAVING count(*) > 2
        LIMIT 50
      `,
    },
    {
      code: "twelve_with_ordinary_member",
      severity: "critical",
      title: "Célula de 12 con miembro ordinario activo",
      query: sql`
        SELECT cm.id::text AS id
        FROM cell_memberships cm
        INNER JOIN cells c ON c.id = cm.cell_id
        LEFT JOIN person_leadership pl ON pl.person_id = cm.person_id
        WHERE c.type = 'twelve'
          AND cm.status = 'active'
          AND cm.role = 'member'
          AND (pl.status IS DISTINCT FROM 'active')
        LIMIT 50
      `,
    },
    {
      code: "more_than_twelve_direct_leaders",
      severity: "critical",
      title: "Más de 12 líderes directos activos",
      query: sql`
        SELECT direct_leader_person_id AS id
        FROM person_leadership
        WHERE status = 'active' AND direct_leader_person_id IS NOT NULL
        GROUP BY direct_leader_person_id
        HAVING count(*) > 12
        LIMIT 50
      `,
    },
    {
      code: "multiple_open_org_history",
      severity: "critical",
      title: "Múltiples filas abiertas de organization history",
      query: sql`
        SELECT person_id AS id
        FROM person_organization_history
        WHERE effective_to IS NULL
        GROUP BY person_id
        HAVING count(*) > 1
        LIMIT 50
      `,
    },
    {
      code: "missing_self_closure",
      severity: "warning",
      title: "Líderes active sin fila self en closure",
      query: sql`
        SELECT pl.person_id AS id
        FROM person_leadership pl
        WHERE pl.status = 'active'
          AND NOT EXISTS (
            SELECT 1 FROM leadership_closure lc
            WHERE lc.ancestor_person_id = pl.person_id
              AND lc.descendant_person_id = pl.person_id
              AND lc.depth = 0
          )
        LIMIT 50
      `,
    },
    {
      code: "closure_parent_mismatch",
      severity: "warning",
      title: "Closure depth=1 no coincide con líder directo",
      query: sql`
        SELECT pl.person_id AS id
        FROM person_leadership pl
        WHERE pl.status = 'active'
          AND pl.direct_leader_person_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM leadership_closure lc
            WHERE lc.ancestor_person_id = pl.direct_leader_person_id
              AND lc.descendant_person_id = pl.person_id
              AND lc.depth = 1
          )
        LIMIT 50
      `,
    },
  ];

  for (const c of checks) {
    const { count, sampleIds } = await runCount(c.query);
    if (count > 0) {
      violations.push({
        code: c.code,
        severity: c.severity,
        title: c.title,
        count,
        sampleIds,
      });
    }
  }

  const criticalCount = violations
    .filter((v) => v.severity === "critical")
    .reduce((a, v) => a + v.count, 0);
  const warningCount = violations
    .filter((v) => v.severity === "warning")
    .reduce((a, v) => a + v.count, 0);

  return {
    checkedAt: new Date().toISOString(),
    violations,
    criticalCount,
    warningCount,
    healthy: criticalCount === 0,
  };
}
