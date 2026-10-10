import type { Id } from "../../../convex/_generated/dataModel";
import { withId } from "@/lib/convex-doc";
import { mapConvexError } from "@/lib/convex-errors";
import { DomainError, DomainErrorCode } from "@/lib/errors";
import { writeAuditLog } from "@/modules/audit";
import {
  assertCanMutate,
  hasPermission,
  loadAuthContext,
} from "@/modules/authorization";
import { formatFullName } from "@/modules/ganar/normalize";
import { assertProcessAccess } from "@/modules/formation/service";
import { api, getAuthenticatedConvexClient } from "@/server/convex";

import { countContacts, countTeam, milestoneKeysForLevel } from "./progress";
import { projectAll, type CycleWindow, type ProjectionResult } from "./projections";

async function requireActor(userId: string) {
  return loadAuthContext(userId);
}

async function currentOrg(personId: string) {
  const client = await getAuthenticatedConvexClient();
  const org = await client.query(api.persons.getCurrentOrg, {
    personId: personId as Id<"persons">,
  });
  if (!org) return null;
  return {
    ministryId: (org.ministryId as string | undefined) ?? null,
    networkId: (org.networkId as string | undefined) ?? null,
  };
}

export async function openOrGetExpediente(
  actorUserId: string,
  studentPersonId: string,
  openedAtAcademicLevel?: string,
) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "destination.manage", {
    type: "process",
    personId: studentPersonId,
  });
  const org = await currentOrg(studentPersonId);
  if (!org?.ministryId) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, "Sin pertenencia ministerial.");
  }
  await assertProcessAccess(actor, studentPersonId, org.ministryId);
  const client = await getAuthenticatedConvexClient();
  const row = await client
    .mutation(api.multiplication.openExpediente, {
      studentPersonId: studentPersonId as Id<"persons">,
      ministryId: org.ministryId as Id<"ministries">,
      networkId: (org.networkId ?? undefined) as Id<"networks"> | undefined,
      openedAtAcademicLevel,
    })
    .catch(mapConvexError);
  await writeAuditLog({
    actorUserId,
    action: "multiplication.expediente.open",
    entityType: "multiplication_expediente",
    entityId: row!._id,
    metadata: { studentPersonId },
  });
  return withId(row!);
}

export async function getExpedienteProgress(actorUserId: string, studentPersonId: string) {
  const actor = await requireActor(actorUserId);
  if (!hasPermission(actor, "process.read") && !hasPermission(actor, "destination.read")) {
    throw new DomainError(DomainErrorCode.PROCESS_ACCESS_DENIED, "Sin permiso.");
  }
  const client = await getAuthenticatedConvexClient();
  const expediente = await client.query(api.multiplication.getExpedienteByStudent, {
    studentPersonId: studentPersonId as Id<"persons">,
  });
  if (!expediente) {
    return null;
  }
  await assertProcessAccess(
    actor,
    studentPersonId,
    expediente.ministryId as string,
  );
  const bundle = await client.query(api.multiplication.getExpedienteBundle, {
    expedienteId: expediente._id,
  });
  if (!bundle) return null;

  const contacts = bundle.contacts.map((c) => ({
    id: c._id as string,
    orderIndex: c.orderIndex,
    fullName: c.fullName,
    phone: c.phone ?? null,
    status: c.status,
    linkedPersonId: (c.linkedPersonId as string | undefined) ?? null,
  }));
  const disciples = bundle.disciples.map((d) => ({
    id: d._id as string,
    personId: d.personId as string,
    slotIndex: d.slotIndex,
    cohort: d.cohort,
    origin: d.origin,
    formationStatus: d.formationStatus,
    cellId: (d.cellId as string | undefined) ?? null,
  }));

  return {
    expediente: withId(bundle.expediente),
    contacts,
    disciples,
    milestones: bundle.milestones.map((m) => withId(m)),
    counters: {
      contacts: countContacts(contacts),
      team: countTeam(disciples),
    },
  };
}

export async function upsertContactSlot(
  actorUserId: string,
  raw: {
    expedienteId: string;
    orderIndex: number;
    fullName: string;
    phone?: string;
    notes?: string;
    status?: "contact" | "following" | "won" | "dropped";
  },
) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "destination.manage", { type: "training" });
  const client = await getAuthenticatedConvexClient();
  const row = await client
    .mutation(api.multiplication.upsertContact, {
      expedienteId: raw.expedienteId as Id<"multiplicationExpedientes">,
      orderIndex: raw.orderIndex,
      fullName: raw.fullName,
      phone: raw.phone,
      notes: raw.notes,
      status: raw.status,
    })
    .catch(mapConvexError);
  return withId(row!);
}

export async function linkWonContact(
  actorUserId: string,
  contactId: string,
  linkedPersonId: string,
) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "destination.manage", {
    type: "process",
    personId: linkedPersonId,
  });
  const client = await getAuthenticatedConvexClient();
  const row = await client
    .mutation(api.multiplication.linkContactAsWon, {
      contactId: contactId as Id<"multiplicationContacts">,
      linkedPersonId: linkedPersonId as Id<"persons">,
    })
    .catch(mapConvexError);
  await writeAuditLog({
    actorUserId,
    action: "multiplication.contact.won",
    entityType: "multiplication_contact",
    entityId: contactId,
    metadata: { linkedPersonId },
  });
  return withId(row!);
}

export async function assignTeamDisciple(
  actorUserId: string,
  raw: {
    expedienteId: string;
    personId: string;
    slotIndex: number;
    cohort: "first_six" | "second_six";
    origin: "won" | "recovered" | "assigned";
    notes?: string;
  },
) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "destination.manage", {
    type: "process",
    personId: raw.personId,
  });
  const client = await getAuthenticatedConvexClient();
  const row = await client
    .mutation(api.multiplication.assignDisciple, {
      expedienteId: raw.expedienteId as Id<"multiplicationExpedientes">,
      personId: raw.personId as Id<"persons">,
      slotIndex: raw.slotIndex,
      cohort: raw.cohort,
      origin: raw.origin,
      notes: raw.notes,
    })
    .catch(mapConvexError);
  await writeAuditLog({
    actorUserId,
    action: "multiplication.disciple.assign",
    entityType: "multiplication_disciple",
    entityId: row!._id,
    metadata: { personId: raw.personId, slotIndex: raw.slotIndex },
  });
  return withId(row!);
}

export async function setDiscipleFormationStatus(
  actorUserId: string,
  raw: {
    discipleId: string;
    formationStatus:
      | "en_formacion"
      | "apto_liderar"
      | "lider_aprobado"
      | "lider_activo_celula";
    cellId?: string;
    notes?: string;
  },
) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "leaders.activate", { type: "leader" });
  const client = await getAuthenticatedConvexClient();
  const row = await client
    .mutation(api.multiplication.updateDiscipleFormation, {
      discipleId: raw.discipleId as Id<"multiplicationDisciples">,
      formationStatus: raw.formationStatus,
      cellId: (raw.cellId || undefined) as Id<"cells"> | undefined,
      notes: raw.notes,
    })
    .catch(mapConvexError);
  return withId(row!);
}

export async function seedDefaultMilestones(actorUserId: string, expedienteId: string) {
  const actor = await requireActor(actorUserId);
  assertCanMutate(actor, "destination.manage", { type: "training" });
  const client = await getAuthenticatedConvexClient();
  const levels = ["cd1", "cd2", "cd3", "em1", "em2", "em3"] as const;
  for (const level of levels) {
    for (const key of milestoneKeysForLevel(level)) {
      await client
        .mutation(api.multiplication.upsertMilestone, {
          expedienteId: expedienteId as Id<"multiplicationExpedientes">,
          level,
          key,
          status: "pending",
          updatedByUserId: actorUserId as Id<"users">,
        })
        .catch(mapConvexError);
    }
  }
}

export async function listOpenExpedientesSummary(actorUserId: string) {
  const actor = await requireActor(actorUserId);
  if (!hasPermission(actor, "process.read") && !hasPermission(actor, "destination.read")) {
    throw new DomainError(DomainErrorCode.PROCESS_ACCESS_DENIED, "Sin permiso.");
  }
  const client = await getAuthenticatedConvexClient();
  const ministryId = actor.ministryIds[0] as Id<"ministries"> | undefined;
  const rows = await client.query(api.multiplication.listExpedientesByMinistry, {
    ministryId,
    status: "open",
  });

  const out = [];
  for (const row of rows) {
    try {
      await assertProcessAccess(
        actor,
        row.studentPersonId as string,
        row.ministryId as string,
      );
    } catch {
      continue;
    }
    const person = await client.query(api.persons.getById, {
      personId: row.studentPersonId,
    });
    const bundle = await client.query(api.multiplication.getExpedienteBundle, {
      expedienteId: row._id,
    });
    const disciples = (bundle?.disciples ?? []).map((d) => ({
      personId: d.personId as string,
      slotIndex: d.slotIndex,
      cohort: d.cohort,
      formationStatus: d.formationStatus,
      cellId: (d.cellId as string | undefined) ?? null,
    }));
    const contacts = (bundle?.contacts ?? []).map((c) => ({
      orderIndex: c.orderIndex,
      status: c.status,
      linkedPersonId: (c.linkedPersonId as string | undefined) ?? null,
    }));
    out.push({
      expedienteId: row._id as string,
      studentPersonId: row.studentPersonId as string,
      fullName: person
        ? formatFullName(person.firstName, person.lastName)
        : row.studentPersonId,
      counters: {
        contacts: countContacts(contacts),
        team: countTeam(disciples),
      },
    });
  }
  return out;
}

export async function buildProjectionsForStudent(
  actorUserId: string,
  studentPersonId: string,
  asOfDate: string,
): Promise<ProjectionResult[]> {
  const actor = await requireActor(actorUserId);
  if (!hasPermission(actor, "process.read")) {
    throw new DomainError(DomainErrorCode.PROCESS_ACCESS_DENIED, "Sin permiso.");
  }
  void studentPersonId;

  const toWindow = (
    cycle: { name: string; startDate: string; endDate: string } | null,
    code: string,
  ): CycleWindow | null =>
    cycle
      ? {
          code,
          name: cycle.name,
          startDate: String(cycle.startDate),
          endDate: String(cycle.endDate),
        }
      : null;

  const { listEmLevelCycles, listDestinoCycles, listConsolidarCycles, listReencuentroEvents } =
    await import("@/modules/formation");

  const [em1Cycles, em2Cycles, em3Cycles, cd1Cycles, cd2Cycles, reEvents, encCycles] =
    await Promise.all([
      listEmLevelCycles(actorUserId, 1),
      listEmLevelCycles(actorUserId, 2),
      listEmLevelCycles(actorUserId, 3),
      listDestinoCycles(actorUserId, 1),
      listDestinoCycles(actorUserId, 2),
      listReencuentroEvents(actorUserId),
      listConsolidarCycles(actorUserId, "encuentro"),
    ]);

  const pickActiveOrNext = <T extends { status: string; startDate: string }>(rows: T[]) =>
    rows.find((r) => r.status === "active") ??
    rows
      .filter((r) => r.status === "planned" || r.status === "active")
      .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)))[0] ??
    null;

  return projectAll({
    asOfDate,
    leaderEmWindow:
      toWindow(pickActiveOrNext(em1Cycles), "em1") ??
      toWindow(pickActiveOrNext(em2Cycles), "em2") ??
      toWindow(pickActiveOrNext(em3Cycles), "em3"),
    discipleCd1Window: toWindow(pickActiveOrNext(cd1Cycles), "cd1"),
    discipleCd2Window: toWindow(pickActiveOrNext(cd2Cycles), "cd2"),
    discipleReencuentroWindow: toWindow(pickActiveOrNext(reEvents), "reencuentro"),
    discipleEncuentroWindow: toWindow(pickActiveOrNext(encCycles), "encuentro"),
  });
}
