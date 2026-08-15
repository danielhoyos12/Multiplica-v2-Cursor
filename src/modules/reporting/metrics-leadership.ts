/**
 * G12 leadership metrics — derived from person_leadership + closure + cells.
 * X/12 = active direct leaders with valid cell. eligible does NOT count.
 */
import { and, count, eq, gt, gte, inArray, lte, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { cells, leadershipClosure, personLeadership, persons } from "@/db/schema";
import { formatFullName } from "@/modules/ganar/normalize";
import { getTwelveProgress } from "@/modules/leadership/service";

import { ReportingThresholds } from "./period";
import type { DashboardScope } from "./scope";
import { leadershipScopeCondition } from "./sql-scope";

export type LeadershipMetrics = {
  active: number;
  eligible: number;
  inactive: number;
  activeWithCell: number;
  activeWithoutCell: number;
  activatedInPeriod: number;
  twelveBuckets: { "0-3": number; "4-7": number; "8-11": number; "12": number };
  generations: {
    depth1: number;
    depth2: number;
    depth3: number;
    potentialLabel: string;
  };
  focus?: {
    personId: string;
    fullName: string;
    code: string | null;
    progress: { current: number; max: number; ready: boolean; label: string };
    progressBand: "0-3" | "4-7" | "8-11" | "12";
  };
};

function band(n: number): "0-3" | "4-7" | "8-11" | "12" {
  if (n >= 12) return "12";
  if (n >= 8) return "8-11";
  if (n >= 4) return "4-7";
  return "0-3";
}

export async function getLeadershipMetrics(
  scope: DashboardScope,
  periodFrom?: Date,
  periodTo?: Date,
): Promise<LeadershipMetrics> {
  const db = getDb();
  const scopeCond = leadershipScopeCondition(scope);
  const where = scopeCond ?? undefined;

  const statusRows = await db
    .select({ status: personLeadership.status, c: count() })
    .from(personLeadership)
    .where(where)
    .groupBy(personLeadership.status);

  let active = 0;
  let eligible = 0;
  let inactive = 0;
  for (const r of statusRows) {
    const n = Number(r.c);
    if (r.status === "active") active = n;
    else if (r.status === "eligible") eligible = n;
    else if (r.status === "inactive") inactive = n;
  }

  // Active with open responsible cell
  const [withCell] = await db.execute<{ c: string }>(sql`
    SELECT count(*)::text AS c
    FROM person_leadership pl
    WHERE pl.status = 'active'
      AND EXISTS (
        SELECT 1 FROM cells c
        WHERE c.responsible_person_id = pl.person_id
          AND c.status <> 'closed'
      )
      ${
        scope.mode === "subtree" && scope.rootPersonId
          ? sql`AND pl.person_id IN (
              SELECT descendant_person_id FROM leadership_closure
              WHERE ancestor_person_id = ${scope.rootPersonId}::uuid
            )`
          : scope.mode === "ministry" && scope.ministryIds.length
            ? sql`AND pl.ministry_id IN (${sql.join(
                scope.ministryIds.map((id) => sql`${id}::uuid`),
                sql`, `,
              )})`
            : sql``
      }
  `);
  const withCellList = Array.isArray(withCell)
    ? withCell
    : ((withCell as { rows?: typeof withCell }).rows ?? []);
  const activeWithCell = Number(
    (withCellList as Array<{ c: string }>)[0]?.c ?? 0,
  );
  const activeWithoutCell = Math.max(0, active - activeWithCell);

  let activatedInPeriod = 0;
  if (periodFrom && periodTo) {
    const [row] = await db
      .select({ c: count() })
      .from(personLeadership)
      .where(
        and(
          scopeCond,
          eq(personLeadership.status, "active"),
          gte(personLeadership.activatedAt, periodFrom),
          lte(personLeadership.activatedAt, periodTo),
        ),
      );
    activatedInPeriod = Number(row?.c ?? 0);
  }

  // Generation depths relative to focus root (or all roots when global/ministry)
  const root = scope.rootPersonId;
  let depth1 = 0;
  let depth2 = 0;
  let depth3 = 0;
  if (root) {
    const depthRows = await db
      .select({
        depth: leadershipClosure.depth,
        c: count(),
      })
      .from(leadershipClosure)
      .innerJoin(
        personLeadership,
        and(
          eq(personLeadership.personId, leadershipClosure.descendantPersonId),
          eq(personLeadership.status, "active"),
        ),
      )
      .where(
        and(
          eq(leadershipClosure.ancestorPersonId, root),
          gt(leadershipClosure.depth, 0),
          sql`${leadershipClosure.depth} <= 3`,
        ),
      )
      .groupBy(leadershipClosure.depth);
    for (const r of depthRows) {
      if (r.depth === 1) depth1 = Number(r.c);
      if (r.depth === 2) depth2 = Number(r.c);
      if (r.depth === 3) depth3 = Number(r.c);
    }
  }

  // Twelve progress bands for active leaders in scope
  const buckets = { "0-3": 0, "4-7": 0, "8-11": 0, "12": 0 };
  const leaders = await db
    .select({ personId: personLeadership.personId })
    .from(personLeadership)
    .where(and(scopeCond, eq(personLeadership.status, "active")))
    .limit(500);
  for (const l of leaders) {
    const p = await getTwelveProgress(l.personId);
    buckets[band(p.current)] += 1;
  }

  let focus: LeadershipMetrics["focus"];
  if (root) {
    const [p] = await db.select().from(persons).where(eq(persons.id, root)).limit(1);
    const [lead] = await db
      .select()
      .from(personLeadership)
      .where(eq(personLeadership.personId, root))
      .limit(1);
    if (p && lead) {
      const progress = await getTwelveProgress(root);
      focus = {
        personId: root,
        fullName: formatFullName(p.firstName, p.lastName),
        code: lead.humanLeaderCode,
        progress,
        progressBand: band(progress.current),
      };
    }
  }

  void cells;
  void inArray;
  void ReportingThresholds;

  return {
    active,
    eligible,
    inactive,
    activeWithCell,
    activeWithoutCell,
    activatedInPeriod,
    twelveBuckets: buckets,
    generations: {
      depth1,
      depth2,
      depth3,
      potentialLabel: `Reales depth1=${depth1} (potencial 12), depth2=${depth2} (potencial 144), depth3=${depth3} (potencial 1728)`,
    },
    focus,
  };
}

export type TreeNodeCard = {
  personId: string;
  fullName: string;
  code: string | null;
  status: string;
  networkId: string | null;
  directCount: number;
  descendantCount: number;
  cellCount: number;
  readyForTwelve: boolean;
};

export async function listDirectNodeCards(
  scope: DashboardScope,
  parentPersonId: string,
): Promise<TreeNodeCard[]> {
  const db = getDb();
  // Auth already validated via resolveDashboardScope + assertTreeAccess callers
  const directs = await db
    .select({
      personId: personLeadership.personId,
      status: personLeadership.status,
      code: personLeadership.humanLeaderCode,
      networkId: personLeadership.networkId,
      firstName: persons.firstName,
      lastName: persons.lastName,
    })
    .from(personLeadership)
    .innerJoin(persons, eq(persons.id, personLeadership.personId))
    .where(
      and(
        eq(personLeadership.directLeaderPersonId, parentPersonId),
        inArray(personLeadership.status, ["active", "eligible"]),
      ),
    )
    .orderBy(personLeadership.humanLeaderCode);

  const cards: TreeNodeCard[] = [];
  for (const d of directs) {
    const progress = d.status === "active" ? await getTwelveProgress(d.personId) : { current: 0, ready: false };
    const [{ descendants }] = await db
      .select({ descendants: count() })
      .from(leadershipClosure)
      .where(
        and(
          eq(leadershipClosure.ancestorPersonId, d.personId),
          gt(leadershipClosure.depth, 0),
        ),
      );
    const [{ cellCount }] = await db
      .select({ cellCount: count() })
      .from(cells)
      .where(
        and(
          eq(cells.responsiblePersonId, d.personId),
          sql`${cells.status} <> 'closed'`,
        ),
      );
    cards.push({
      personId: d.personId,
      fullName: formatFullName(d.firstName, d.lastName),
      code: d.code,
      status: d.status,
      networkId: d.networkId,
      directCount: progress.current,
      descendantCount: Number(descendants),
      cellCount: Number(cellCount),
      readyForTwelve: Boolean(progress.ready),
    });
  }
  return cards;
}
