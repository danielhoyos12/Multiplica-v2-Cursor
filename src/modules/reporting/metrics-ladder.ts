/**
 * Escalera / formation funnel metrics — derived from person_process_progress.
 * Counts are CURRENT STATE by status, not historical conversion cohorts.
 */
import { and, count, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { personProcessProgress } from "@/db/schema";

import type { DashboardScope } from "./scope";

export type StageStatusCounts = {
  eligible: number;
  in_progress: number;
  academic_completed: number;
  completed: number;
  paused: number;
  pending: number;
  total: number;
};

export type LadderMetrics = {
  methodology: "current_state_counts";
  note: string;
  ganarCompleted: number; // persons in scope (all have won)
  consolidar: {
    pre: StageStatusCounts;
    encuentro: StageStatusCounts;
    post: StageStatusCounts;
    consolidarCompleted: number;
  };
  discipular: {
    cd1: StageStatusCounts;
    cd2: StageStatusCounts;
    reencuentro: StageStatusCounts;
    cd3: StageStatusCounts;
    em1: StageStatusCounts;
    em2: StageStatusCounts;
    em3: StageStatusCounts;
  };
  enviar: StageStatusCounts & { ungidos: number; activados: number };
  funnel: Array<{ code: string; label: string; count: number }>;
};

function emptyStage(): StageStatusCounts {
  return {
    eligible: 0,
    in_progress: 0,
    academic_completed: 0,
    completed: 0,
    paused: 0,
    pending: 0,
    total: 0,
  };
}

function fillStage(
  rows: Array<{ processType: string; status: string; c: number }>,
  type: string,
): StageStatusCounts {
  const s = emptyStage();
  for (const r of rows.filter((x) => x.processType === type)) {
    const n = r.c;
    if (r.status in s) {
      (s as Record<string, number>)[r.status] = n;
    }
    s.total += n;
  }
  return s;
}

function processScopeSql(scope: DashboardScope) {
  if (scope.mode === "subtree" && scope.rootPersonId) {
    return sql`(
      ${personProcessProgress.personId} IN (
        SELECT descendant_person_id FROM leadership_closure
        WHERE ancestor_person_id = ${scope.rootPersonId}::uuid
      )
      OR ${personProcessProgress.assignedLeaderPersonId} = ${scope.rootPersonId}::uuid
    )`;
  }
  if (scope.mode === "ministry" && scope.ministryIds.length) {
    return inArray(personProcessProgress.ministryId, scope.ministryIds);
  }
  return undefined;
}

export async function getLadderMetrics(scope: DashboardScope): Promise<LadderMetrics> {
  const db = getDb();
  const scopeSql = processScopeSql(scope);
  const where = scopeSql
    ? and(
        scopeSql,
        scope.networkId
          ? eq(personProcessProgress.networkId, scope.networkId)
          : undefined,
      )
    : scope.networkId
      ? eq(personProcessProgress.networkId, scope.networkId)
      : undefined;

  const rows = await db
    .select({
      processType: personProcessProgress.processType,
      status: personProcessProgress.status,
      c: count(),
    })
    .from(personProcessProgress)
    .where(where)
    .groupBy(personProcessProgress.processType, personProcessProgress.status);

  const mapped = rows.map((r) => ({
    processType: r.processType,
    status: r.status,
    c: Number(r.c),
  }));

  const pre = fillStage(mapped, "pre_encuentro");
  const encuentro = fillStage(mapped, "encuentro");
  const post = fillStage(mapped, "post_encuentro");
  const consolidarCompleted = fillStage(mapped, "consolidar").completed;

  const cd1 = fillStage(mapped, "destino_n1");
  const cd2 = fillStage(mapped, "destino_n2");
  const reencuentro = fillStage(mapped, "reencuentro");
  const cd3 = fillStage(mapped, "destino_n3");
  const em1 = fillStage(mapped, "em1");
  const em2 = fillStage(mapped, "em2");
  const em3 = fillStage(mapped, "em3");
  const enviar = fillStage(mapped, "enviar");

  // Ungidos / activados among enviar-completed — via leadership join
  const enviarCompletedPeople = sql`${personProcessProgress.personId} IN (
    SELECT person_id FROM person_process_progress
    WHERE process_type = 'enviar' AND status = 'completed'
  )`;

  let ungidos = 0;
  let activados = 0;
  const leadScope =
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
        : sql``;

  const leadRows = await db.execute<{ status: string; c: string }>(sql`
    SELECT pl.status, count(*)::text AS c
    FROM person_leadership pl
    WHERE pl.person_id IN (
      SELECT person_id FROM person_process_progress
      WHERE process_type = 'enviar' AND status = 'completed'
    )
    ${leadScope}
    GROUP BY pl.status
  `);
  const leadList = Array.isArray(leadRows)
    ? leadRows
    : ((leadRows as { rows?: typeof leadRows }).rows ?? []);
  for (const r of leadList as Array<{ status: string; c: string }>) {
    if (r.status === "eligible") ungidos = Number(r.c);
    if (r.status === "active") activados = Number(r.c);
  }

  void enviarCompletedPeople;

  const activeish = (s: StageStatusCounts) =>
    s.eligible + s.in_progress + s.academic_completed + s.completed;

  return {
    methodology: "current_state_counts",
    note: "Conteos actuales por etapa; no son tasas de conversión de cohorte histórica.",
    ganarCompleted: 0, // filled by dashboard from person metrics
    consolidar: { pre, encuentro, post, consolidarCompleted },
    discipular: { cd1, cd2, reencuentro, cd3, em1, em2, em3 },
    enviar: { ...enviar, ungidos, activados },
    funnel: [
      { code: "ganar", label: "GANAR", count: 0 },
      {
        code: "consolidar",
        label: "CONSOLIDAR",
        count: Math.max(activeish(pre), activeish(encuentro), activeish(post), consolidarCompleted),
      },
      {
        code: "discipular",
        label: "DISCIPULAR",
        count: [
          cd1,
          cd2,
          reencuentro,
          cd3,
          em1,
          em2,
          em3,
        ].reduce((a, s) => a + activeish(s), 0),
      },
      {
        code: "enviar",
        label: "ENVIAR",
        count: activeish(enviar),
      },
    ],
  };
}
