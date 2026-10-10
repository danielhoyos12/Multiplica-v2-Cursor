/**
 * Escalera / formation funnel metrics — derived from person_process_progress.
 * Counts are CURRENT STATE by status, not historical conversion cohorts.
 */
import { api, getAuthenticatedConvexClient } from "@/server/convex";

import { buildScopeMatcher } from "./convex-scope";
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
    /** Persons with Pre+Encuentro+Post all completed (UDLV). */
    consolidarCompleted: number;
    /** Persons with Consolidar/UDLV started but not fully complete. */
    consolidarInProgress: number;
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
  rows: Array<{ processType: string; status: string }>,
  type: string,
): StageStatusCounts {
  const s = emptyStage();
  for (const r of rows.filter((x) => x.processType === type)) {
    if (r.status in s) {
      (s as Record<string, number>)[r.status] += 1;
    }
    s.total += 1;
  }
  return s;
}

export async function getLadderMetrics(scope: DashboardScope): Promise<LadderMetrics> {
  const client = await getAuthenticatedConvexClient();
  const [rows, matches, leadershipSnapshot] = await Promise.all([
    client.query(api.formation.listProgressRows, {}),
    buildScopeMatcher(scope),
    client.query(api.reporting.leadershipSnapshot, {}),
  ]);

  const scoped = rows
    .map((r) => r.progress)
    .filter((p) => matches({ personId: p.personId, ministryId: p.ministryId, networkId: p.networkId }));

  const pre = fillStage(scoped, "pre_encuentro");
  const encuentro = fillStage(scoped, "encuentro");
  const post = fillStage(scoped, "post_encuentro");

  // Derive Consolidar completion from UDLV stages per person (ignore false aggregate completes).
  const byPerson = new Map<
    string,
    { pre?: string; encuentro?: string; post?: string; consolidar?: string }
  >();
  for (const p of scoped) {
    const cur = byPerson.get(p.personId) ?? {};
    if (p.processType === "pre_encuentro") cur.pre = p.status;
    if (p.processType === "encuentro") cur.encuentro = p.status;
    if (p.processType === "post_encuentro") cur.post = p.status;
    if (p.processType === "consolidar") cur.consolidar = p.status;
    byPerson.set(p.personId, cur);
  }
  let consolidarCompleted = 0;
  let consolidarInProgress = 0;
  for (const row of byPerson.values()) {
    const udlvDone =
      row.pre === "completed" && row.encuentro === "completed" && row.post === "completed";
    if (udlvDone) {
      consolidarCompleted += 1;
      continue;
    }
    const stageActive = [row.pre, row.encuentro, row.post].some(
      (s) =>
        s === "eligible" ||
        s === "in_progress" ||
        s === "academic_completed" ||
        s === "completed",
    );
    if (row.consolidar === "in_progress" || row.consolidar === "completed" || stageActive) {
      consolidarInProgress += 1;
    }
  }

  const cd1 = fillStage(scoped, "destino_n1");
  const cd2 = fillStage(scoped, "destino_n2");
  const reencuentro = fillStage(scoped, "reencuentro");
  const cd3 = fillStage(scoped, "destino_n3");
  const em1 = fillStage(scoped, "em1");
  const em2 = fillStage(scoped, "em2");
  const em3 = fillStage(scoped, "em3");
  const enviar = fillStage(scoped, "enviar");

  // Ungidos / activados among enviar-completed — via leadership join
  const enviarCompletedPersonIds = new Set(
    scoped.filter((p) => p.processType === "enviar" && p.status === "completed").map((p) => p.personId),
  );

  let ungidos = 0;
  let activados = 0;
  for (const l of leadershipSnapshot) {
    if (!enviarCompletedPersonIds.has(l.personId)) continue;
    if (!matches({ personId: l.personId, ministryId: l.ministryId, networkId: l.networkId })) continue;
    if (l.status === "eligible") ungidos += 1;
    if (l.status === "active") activados += 1;
  }

  const activeish = (s: StageStatusCounts) =>
    s.eligible + s.in_progress + s.academic_completed + s.completed;

  return {
    methodology: "current_state_counts",
    note: "Consolidar completado = Pre+Encuentro+Post (UDLV). Ganar y Consolidar en curso son métricas distintas por persona.",
    ganarCompleted: 0, // filled by dashboard from person metrics
    consolidar: {
      pre,
      encuentro,
      post,
      consolidarCompleted,
      consolidarInProgress,
    },
    discipular: { cd1, cd2, reencuentro, cd3, em1, em2, em3 },
    enviar: { ...enviar, ungidos, activados },
    funnel: [
      { code: "ganar", label: "GANAR", count: 0 },
      {
        code: "consolidar",
        label: "CONSOLIDAR",
        // Unique persons in Consolidar (en curso + completadas), not sum of stage rows.
        count: consolidarCompleted + consolidarInProgress,
      },
      {
        code: "discipular",
        label: "DISCIPULAR",
        count: [cd1, cd2, reencuentro, cd3, em1, em2, em3].reduce((a, s) => a + activeish(s), 0),
      },
      {
        code: "enviar",
        label: "ENVIAR",
        count: activeish(enviar),
      },
    ],
  };
}
