/**
 * G12 leadership metrics — derived from person_leadership + closure + cells.
 * X/12 = active direct leaders with valid cell. eligible does NOT count.
 */
import type { Id } from "../../../convex/_generated/dataModel";
import { api, getConvexHttpClient } from "@/server/convex";

import { formatFullName } from "@/modules/ganar/normalize";
import { getTwelveProgress } from "@/modules/leadership/service";

import { buildScopeMatcher } from "./convex-scope";
import type { DashboardScope } from "./scope";

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

async function scopedLeaders(scope: DashboardScope) {
  const client = getConvexHttpClient();
  const [snapshot, matches] = await Promise.all([
    client.query(api.reporting.leadershipSnapshot, {}),
    buildScopeMatcher(scope),
  ]);
  return snapshot.filter((l) => matches({ personId: l.personId, ministryId: l.ministryId, networkId: l.networkId }));
}

export async function getLeadershipMetrics(
  scope: DashboardScope,
  periodFrom?: Date,
  periodTo?: Date,
): Promise<LeadershipMetrics> {
  const client = getConvexHttpClient();
  const leaders = await scopedLeaders(scope);

  let active = 0;
  let eligible = 0;
  let inactive = 0;
  for (const l of leaders) {
    if (l.status === "active") active += 1;
    else if (l.status === "eligible") eligible += 1;
    else if (l.status === "inactive") inactive += 1;
  }

  const activeLeaders = leaders.filter((l) => l.status === "active");
  const cellsSnapshot = await client.query(api.reporting.cellsSnapshot, {});
  const responsibleWithOpenCell = new Set(
    cellsSnapshot.filter((c) => c.status !== "closed" && c.responsiblePersonId).map((c) => c.responsiblePersonId),
  );
  const activeWithCell = activeLeaders.filter((l) => responsibleWithOpenCell.has(l.personId)).length;
  const activeWithoutCell = Math.max(0, active - activeWithCell);

  let activatedInPeriod = 0;
  if (periodFrom && periodTo) {
    const fromMs = periodFrom.getTime();
    const toMs = periodTo.getTime();
    activatedInPeriod = activeLeaders.filter(
      (l) => l.activatedAt !== undefined && l.activatedAt >= fromMs && l.activatedAt <= toMs,
    ).length;
  }

  // Generation depths relative to focus root (or none when global/ministry)
  const root = scope.rootPersonId;
  let depth1 = 0;
  let depth2 = 0;
  let depth3 = 0;
  if (root) {
    const descendants = await client.query(api.leadership.listDescendants, {
      ancestorPersonId: root as Id<"persons">,
    });
    const activeIds = new Set(activeLeaders.map((l) => l.personId));
    for (const d of descendants) {
      if (!activeIds.has(d.personId)) continue;
      if (d.depth === 1) depth1 += 1;
      if (d.depth === 2) depth2 += 1;
      if (d.depth === 3) depth3 += 1;
    }
  }

  // Twelve progress bands for active leaders in scope
  const buckets = { "0-3": 0, "4-7": 0, "8-11": 0, "12": 0 };
  for (const l of activeLeaders.slice(0, 500)) {
    const p = await getTwelveProgress(l.personId);
    buckets[band(p.current)] += 1;
  }

  let focus: LeadershipMetrics["focus"];
  if (root) {
    const rootLeader = leaders.find((l) => l.personId === root) ?? (await scopedLeaderById(client, root));
    if (rootLeader) {
      const progress = await getTwelveProgress(root);
      focus = {
        personId: root,
        fullName: formatFullName(rootLeader.firstName, rootLeader.lastName),
        code: rootLeader.humanLeaderCode ?? null,
        progress,
        progressBand: band(progress.current),
      };
    }
  }

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

async function scopedLeaderById(client: ReturnType<typeof getConvexHttpClient>, personId: string) {
  const leadership = await client.query(api.leadership.getByPerson, { personId: personId as Id<"persons"> });
  if (!leadership) return null;
  const person = await client.query(api.persons.getById, { personId: personId as Id<"persons"> });
  if (!person) return null;
  return {
    personId: leadership.personId,
    firstName: person.firstName,
    lastName: person.lastName,
    humanLeaderCode: leadership.humanLeaderCode,
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
  const client = getConvexHttpClient();
  // Auth already validated via resolveDashboardScope + assertTreeAccess callers
  const [leadershipSnapshot, cellsSnapshot] = await Promise.all([
    client.query(api.reporting.leadershipSnapshot, {}),
    client.query(api.reporting.cellsSnapshot, {}),
  ]);

  const directs = leadershipSnapshot
    .filter(
      (l) =>
        l.directLeaderPersonId === parentPersonId &&
        (l.status === "active" || l.status === "eligible"),
    )
    .sort((a, b) => (a.humanLeaderCode ?? "").localeCompare(b.humanLeaderCode ?? ""));

  const cards: TreeNodeCard[] = [];
  for (const d of directs) {
    const progress = d.status === "active" ? await getTwelveProgress(d.personId) : { current: 0, ready: false };
    const descendants = await client.query(api.leadership.listDescendants, {
      ancestorPersonId: d.personId as Id<"persons">,
    });
    const cellCount = cellsSnapshot.filter(
      (c) => c.responsiblePersonId === d.personId && c.status !== "closed",
    ).length;
    cards.push({
      personId: d.personId,
      fullName: formatFullName(d.firstName, d.lastName),
      code: d.humanLeaderCode ?? null,
      status: d.status,
      networkId: d.networkId,
      directCount: progress.current,
      descendantCount: descendants.length,
      cellCount,
      readyForTwelve: Boolean(progress.ready),
    });
  }
  return cards;
}
