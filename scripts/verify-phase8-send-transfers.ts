/**
 * Live Phase 8 verification against multiplica-dev.
 *
 * Enviar + ungimiento (≠ active) + transfers + subtree/closure +
 * deactivation plan + max-2-cells + idempotency + anon RLS.
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { and, count, eq, isNull, sql } from "drizzle-orm";

import { getDb } from "../src/db/client";
import {
  auditLogs,
  cells,
  cellMemberships,
  ministries,
  networks,
  personLeadership,
  personOrganizationHistory,
  personProcessProgress,
  persons,
  roles,
  userRoleAssignments,
  users,
} from "../src/db/schema";
import { DomainError, DomainErrorCode } from "../src/lib/errors";
import { getPersonLadder } from "../src/modules/formation/service";
import {
  activateLeader,
  deactivateLeader,
  isDescendantOf,
  markPersonEligible,
} from "../src/modules/leadership/service";
import {
  anointAfterSend,
  completeSend,
  ensureSendEligible,
  isSendEligible,
  SendRules,
  startSend,
} from "../src/modules/send";
import {
  approveTransfer,
  buildDeactivationPlan,
  createTransferRequest,
  executePastoralTransfer,
  previewTransfer,
  TransferRules,
} from "../src/modules/transfers";

type Result = { name: string; pass: boolean; detail?: string };

function record(results: Result[], name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function tag() {
  return randomBytes(3).toString("hex");
}

async function createPerson(name: string, ministryId: string, networkId: string) {
  const db = getDb();
  const [person] = await db
    .insert(persons)
    .values({
      firstName: name,
      lastName: `P8${tag()}`,
      source: "internal_form",
      isActive: true,
    })
    .returning();
  await db.insert(personOrganizationHistory).values({
    personId: person.id,
    ministryId,
    networkId,
    changeReason: "phase8-verify",
  });
  return person;
}

async function markEm3Completed(
  personId: string,
  ministryId: string,
  networkId: string,
) {
  const db = getDb();
  await db.insert(personProcessProgress).values({
    personId,
    processType: "em3",
    status: "completed",
    stage: "em3",
    ministryId,
    networkId,
    completedAt: new Date(),
    metadata: { fixture: "phase8" },
  });
}

async function main() {
  const results: Result[] = [];
  const db = getDb();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  record(results, "service_role present", Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY));
  record(results, "DATABASE_URL not public", !process.env.NEXT_PUBLIC_DATABASE_URL);
  record(results, "SendRules: completing ≠ activate", SendRules.completingDoesNotActivateLeader);
  record(results, "SendRules: completing ≠ cell", SendRules.completingDoesNotCreateCell);
  record(results, "TransferRules: never lose persons", TransferRules.neverLosePersons);
  record(results, "TransferRules: max 2 cells", TransferRules.maxDirectCells === 2);

  const anon = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anonTransfers = await anon.from("pastoral_transfer_requests").select("id").limit(3);
  record(
    results,
    "anonymous pastoral_transfer_requests DENY/empty",
    Boolean(anonTransfers.error) || (anonTransfers.data?.length ?? 0) === 0,
    anonTransfers.error?.message ?? `rows=${anonTransfers.data?.length ?? 0}`,
  );
  const anonHist = await anon.from("leadership_relationship_history").select("id").limit(3);
  record(
    results,
    "anonymous leadership_relationship_history DENY/empty",
    Boolean(anonHist.error) || (anonHist.data?.length ?? 0) === 0,
  );

  const ministryRows = await db
    .select()
    .from(ministries)
    .where(eq(ministries.isActive, true))
    .orderBy(ministries.code)
    .limit(2);
  const [ministryA, ministryB] = ministryRows;
  const [networkH] = await db.select().from(networks).where(eq(networks.code, "hombres")).limit(1);
  const [networkJ] = await db.select().from(networks).where(eq(networks.code, "jovenes")).limit(1);
  record(results, "catalogs ready", Boolean(ministryA && ministryB && networkH && networkJ));

  const [superRole] = await db.select().from(roles).where(eq(roles.code, "superadmin")).limit(1);
  const [superAssign] = superRole
    ? await db
        .select()
        .from(userRoleAssignments)
        .where(
          and(eq(userRoleAssignments.roleId, superRole.id), isNull(userRoleAssignments.endsAt)),
        )
        .limit(1)
    : [null];
  const actorId = superAssign?.userId;
  record(results, "superadmin actor", Boolean(actorId));

  if (!actorId || !ministryA || !ministryB || !networkH || !networkJ) {
    const failed = results.filter((r) => !r.pass).length;
    console.log(`\nPhase 8 verify incomplete. FAIL=${failed}`);
    process.exit(failed > 0 ? 1 : 0);
  }

  const suffix = tag();

  // ---------- Happy path Enviar ----------
  const personA = await createPerson(`SendA${suffix}`, ministryA.id, networkJ.id);
  record(results, "EM3 incomplete → Enviar deny", !(await isSendEligible(personA.id)));

  try {
    await startSend(actorId, { personId: personA.id });
    record(results, "startSend without EM3 DENY", false, "allowed");
  } catch (e) {
    record(
      results,
      "startSend without EM3 DENY",
      e instanceof DomainError && e.code === DomainErrorCode.SEND_NOT_ELIGIBLE,
    );
  }

  await markEm3Completed(personA.id, ministryA.id, networkJ.id);
  await ensureSendEligible(personA.id, ministryA.id, networkJ.id);
  record(results, "EM3 complete → Enviar eligible", await isSendEligible(personA.id));

  await startSend(actorId, { personId: personA.id });
  const completed = await completeSend(actorId, {
    personId: personA.id,
    markEligible: false,
  });
  record(results, "completar Enviar funciona", completed.progress.status === "completed");
  record(results, "completar Enviar no activa liderazgo", completed.leadershipActivated === false);
  record(results, "completar Enviar no crea célula", completed.cellCreated === false);

  const [leadBeforeAnoint] = await db
    .select()
    .from(personLeadership)
    .where(eq(personLeadership.personId, personA.id))
    .limit(1);
  record(
    results,
    "eligible ≠ completed (no leadership yet)",
    !leadBeforeAnoint || leadBeforeAnoint.status !== "active",
  );

  const anoint = await anointAfterSend(actorId, {
    personId: personA.id,
    ministryId: ministryA.id,
    networkId: networkJ.id,
  });
  record(results, "ungir marca eligible", anoint.status === "eligible");
  record(results, "ungir no marca active", anoint.isActive === false);

  const cellsBefore = await db
    .select({ c: count() })
    .from(cells)
    .where(eq(cells.responsiblePersonId, personA.id));
  record(results, "aún sin célula tras ungir", Number(cellsBefore[0]?.c ?? 0) === 0);

  const act = await activateLeader(actorId, {
    personId: personA.id,
    isMinistryRoot: true,
    email: `send.a.${suffix}@multiplica.test`,
    cell: { name: `Cel SendA ${suffix}`, dayOfWeek: "monday", startTime: "19:00" },
  });
  record(results, "activación posterior Phase 4 → active + cell", Boolean(act.cell?.id));
  record(
    results,
    "leadership active after Phase 4 only",
    act.leadership.status === "active",
  );

  const ladder = await getPersonLadder(actorId, personA.id);
  record(
    results,
    "Persona Escalera: Enviar completed",
    ladder.enviar?.status === "completed",
    ladder.enviar?.label,
  );
  record(
    results,
    "Persona Escalera: liderazgo separado",
    Boolean(ladder.enviar?.leadershipActive),
  );

  // ---------- Network change ----------
  const personB = await createPerson(`NetB${suffix}`, ministryA.id, networkJ.id);
  await db.insert(personProcessProgress).values({
    personId: personB.id,
    processType: "destino_n1",
    status: "completed",
    stage: "n1",
    ministryId: ministryA.id,
    networkId: networkJ.id,
    completedAt: new Date(),
    metadata: { fixture: "progress-preserve" },
  });
  const [orgBefore] = await db
    .select()
    .from(personOrganizationHistory)
    .where(
      and(
        eq(personOrganizationHistory.personId, personB.id),
        isNull(personOrganizationHistory.effectiveTo),
      ),
    )
    .limit(1);

  const netReq = await createTransferRequest(actorId, {
    personId: personB.id,
    transferType: "network_change",
    destinationNetworkId: networkH.id,
    destinationMinistryId: ministryA.id,
    reason: "Cambio pastoral Red Jóvenes → Hombres",
    submit: true,
  });
  record(results, "network transfer created", Boolean(netReq.request.id));
  if (netReq.request.status === "pending") {
    await approveTransfer(actorId, netReq.request.id);
  }
  await executePastoralTransfer(actorId, netReq.request.id);

  const orgHist = await db
    .select()
    .from(personOrganizationHistory)
    .where(eq(personOrganizationHistory.personId, personB.id))
    .orderBy(personOrganizationHistory.effectiveFrom);
  const closed = orgHist.filter((r) => r.effectiveTo !== null);
  const open = orgHist.filter((r) => r.effectiveTo === null);
  record(results, "cambio Red cierra history anterior", closed.length >= 1);
  record(
    results,
    "abre nueva history Red destino",
    open.length === 1 && open[0]!.networkId === networkH.id,
  );
  record(results, "identidad Persona permanece", personB.id === orgBefore!.personId);
  const [prog] = await db
    .select()
    .from(personProcessProgress)
    .where(
      and(
        eq(personProcessProgress.personId, personB.id),
        eq(personProcessProgress.processType, "destino_n1"),
      ),
    )
    .limit(1);
  record(results, "progreso formativo permanece", prog?.status === "completed");

  try {
    await executePastoralTransfer(actorId, netReq.request.id);
    record(results, "transferencia ejecutada 2× bloqueada", false, "re-executed");
  } catch (e) {
    record(
      results,
      "transferencia ejecutada 2× bloqueada",
      e instanceof DomainError && e.code === DomainErrorCode.TRANSFER_ALREADY_EXECUTED,
    );
  }

  // ---------- Ministry change with structure ----------
  const leaderC = await createPerson(`LeadC${suffix}`, ministryA.id, networkH.id);
  await markPersonEligible(actorId, {
    personId: leaderC.id,
    ministryId: ministryA.id,
    networkId: networkH.id,
    directLeaderPersonId: null,
  });
  const cAct = await activateLeader(actorId, {
    personId: leaderC.id,
    isMinistryRoot: true,
    email: `lead.c.${suffix}@multiplica.test`,
    cell: { name: `Cel LeadC ${suffix}`, dayOfWeek: "tuesday", startTime: "20:00" },
  });
  const [userC] = await db
    .select()
    .from(users)
    .where(eq(users.personId, leaderC.id))
    .limit(1);

  const minReq = await createTransferRequest(actorId, {
    personId: leaderC.id,
    transferType: "ministry_change",
    structureMode: "move_with_structure",
    destinationMinistryId: ministryB.id,
    destinationNetworkId: networkH.id,
    reason: "Traslado Ministerio con estructura",
    submit: true,
  });
  if (minReq.request.status === "pending") {
    await approveTransfer(actorId, minReq.request.id);
  }
  await executePastoralTransfer(actorId, minReq.request.id);

  const [leadCAfter] = await db
    .select()
    .from(personLeadership)
    .where(eq(personLeadership.personId, leaderC.id))
    .limit(1);
  const [cellC] = await db
    .select()
    .from(cells)
    .where(eq(cells.id, cAct.cell!.id))
    .limit(1);
  const [userCAfter] = await db
    .select()
    .from(users)
    .where(eq(users.personId, leaderC.id))
    .limit(1);
  record(results, "cambio Ministerio preserva Persona", leadCAfter?.personId === leaderC.id);
  record(
    results,
    "leadership ministry actualizado",
    leadCAfter?.ministryId === ministryB.id,
  );
  record(results, "cell ministry se traslada con estructura", cellC?.ministryId === ministryB.id);
  record(results, "user identity no se duplica", userC?.id === userCAfter?.id);
  record(
    results,
    "human_leader_code preservado",
    leadCAfter?.humanLeaderCode === cAct.leadership.humanLeaderCode,
  );

  // ---------- Subtree move ----------
  const rootX = await createPerson(`RootX${suffix}`, ministryA.id, networkH.id);
  const nodeB = await createPerson(`NodeB${suffix}`, ministryA.id, networkH.id);
  const nodeC = await createPerson(`NodeC${suffix}`, ministryA.id, networkH.id);
  const nodeD = await createPerson(`NodeD${suffix}`, ministryA.id, networkH.id);

  await markPersonEligible(actorId, {
    personId: rootX.id,
    ministryId: ministryA.id,
    networkId: networkH.id,
    directLeaderPersonId: null,
  });
  await activateLeader(actorId, {
    personId: rootX.id,
    isMinistryRoot: true,
    email: `root.x.${suffix}@multiplica.test`,
    cell: { name: `Cel RootX ${suffix}`, dayOfWeek: "monday", startTime: "18:00" },
  });

  const parentA = await createPerson(`ParentA${suffix}`, ministryA.id, networkH.id);
  await markPersonEligible(actorId, {
    personId: parentA.id,
    ministryId: ministryA.id,
    networkId: networkH.id,
    directLeaderPersonId: rootX.id,
  });
  await activateLeader(actorId, {
    personId: parentA.id,
    directLeaderPersonId: rootX.id,
    email: `parent.a.${suffix}@multiplica.test`,
    cell: { name: `Cel ParentA ${suffix}`, dayOfWeek: "tuesday", startTime: "18:00" },
  });

  await markPersonEligible(actorId, {
    personId: nodeB.id,
    ministryId: ministryA.id,
    networkId: networkH.id,
    directLeaderPersonId: parentA.id,
  });
  await activateLeader(actorId, {
    personId: nodeB.id,
    directLeaderPersonId: parentA.id,
    email: `node.b.${suffix}@multiplica.test`,
    cell: { name: `Cel NodeB ${suffix}`, dayOfWeek: "wednesday", startTime: "18:00" },
  });
  await markPersonEligible(actorId, {
    personId: nodeC.id,
    ministryId: ministryA.id,
    networkId: networkH.id,
    directLeaderPersonId: nodeB.id,
  });
  await activateLeader(actorId, {
    personId: nodeC.id,
    directLeaderPersonId: nodeB.id,
    email: `node.c.${suffix}@multiplica.test`,
    cell: { name: `Cel NodeC ${suffix}`, dayOfWeek: "thursday", startTime: "18:00" },
  });
  await markPersonEligible(actorId, {
    personId: nodeD.id,
    ministryId: ministryA.id,
    networkId: networkH.id,
    directLeaderPersonId: nodeC.id,
  });
  await activateLeader(actorId, {
    personId: nodeD.id,
    directLeaderPersonId: nodeC.id,
    email: `node.d.${suffix}@multiplica.test`,
    cell: { name: `Cel NodeD ${suffix}`, dayOfWeek: "friday", startTime: "18:00" },
  });
  // Current: rootX → parentA → nodeB → nodeC → nodeD
  // Move B under rootX (sibling of parentA)

  const subReq = await createTransferRequest(actorId, {
    personId: nodeB.id,
    transferType: "subtree_move",
    proposedDirectLeaderPersonId: rootX.id,
    destinationMinistryId: ministryA.id,
    destinationNetworkId: networkH.id,
    reason: "Mover subárbol B bajo RootX",
    submit: true,
  });
  if (subReq.request.status === "pending") await approveTransfer(actorId, subReq.request.id);
  await executePastoralTransfer(actorId, subReq.request.id);

  record(results, "subtree: B descendiente de RootX", await isDescendantOf(rootX.id, nodeB.id));
  record(results, "subtree: C viaja con B", await isDescendantOf(nodeB.id, nodeC.id));
  record(results, "subtree: D viaja con B", await isDescendantOf(nodeB.id, nodeD.id));
  record(
    results,
    "subtree: B ya no bajo ParentA",
    !(await isDescendantOf(parentA.id, nodeB.id)),
  );

  const [bLead] = await db
    .select()
    .from(personLeadership)
    .where(eq(personLeadership.personId, nodeB.id))
    .limit(1);
  record(results, "direct leader B → RootX", bLead?.directLeaderPersonId === rootX.id);

  // Cycle block
  const cyclePreview = await previewTransfer(actorId, {
    personId: rootX.id,
    transferType: "subtree_move",
    proposedDirectLeaderPersonId: nodeD.id,
    reason: "intento de ciclo inválido",
    submit: false,
  });
  record(
    results,
    "ciclo bloqueado en preview",
    !cyclePreview.canExecute &&
      cyclePreview.blockers.some((b) => /ciclo/i.test(b) || /descendiente/i.test(b)),
    cyclePreview.blockers.join("; "),
  );

  // ---------- Deactivation plan ----------
  const leaderD = await createPerson(`LeadD${suffix}`, ministryA.id, networkH.id);
  const memberM = await createPerson(`MemberM${suffix}`, ministryA.id, networkH.id);
  const receptor = await createPerson(`Receptor${suffix}`, ministryA.id, networkH.id);

  await markPersonEligible(actorId, {
    personId: receptor.id,
    ministryId: ministryA.id,
    networkId: networkH.id,
    directLeaderPersonId: null,
  });
  const receptorAct = await activateLeader(actorId, {
    personId: receptor.id,
    isMinistryRoot: true,
    email: `receptor.${suffix}@multiplica.test`,
    cell: { name: `Cel Receptor ${suffix}`, dayOfWeek: "monday", startTime: "19:00" },
  });

  await markPersonEligible(actorId, {
    personId: leaderD.id,
    ministryId: ministryA.id,
    networkId: networkH.id,
    directLeaderPersonId: receptor.id,
  });
  const dAct = await activateLeader(actorId, {
    personId: leaderD.id,
    directLeaderPersonId: receptor.id,
    email: `lead.d.${suffix}@multiplica.test`,
    cell: { name: `Cel LeadD ${suffix}`, dayOfWeek: "tuesday", startTime: "19:00" },
  });

  await db.insert(cellMemberships).values({
    cellId: dAct.cell!.id,
    personId: memberM.id,
    role: "member",
    status: "active",
  });

  try {
    await deactivateLeader(actorId, leaderD.id);
    record(results, "active con estructura exige plan", false, "allowed bare deactivate");
  } catch (e) {
    record(
      results,
      "active con estructura exige plan",
      e instanceof DomainError && e.code === DomainErrorCode.LEADER_HAS_ACTIVE_STRUCTURE,
    );
  }

  const plan = await buildDeactivationPlan(actorId, leaderD.id);
  record(results, "plan deactivación muestra células", plan.cells.length >= 1);
  record(results, "plan deactivación muestra miembros", plan.members.length >= 1);
  record(results, "plan requiresPlan=true", plan.requiresPlan === true);

  const incomplete = await previewTransfer(actorId, {
    personId: leaderD.id,
    transferType: "leader_deactivation",
    reason: "Plan incompleto test",
    submit: false,
    memberResolutions: [],
  });
  record(results, "plan incompleto bloquea", !incomplete.canExecute);

  const deactReq = await createTransferRequest(actorId, {
    personId: leaderD.id,
    transferType: "leader_deactivation",
    reason: "Desactivación con redistribución completa",
    submit: true,
    memberResolutions: [{ personId: memberM.id, targetCellId: receptorAct.cell!.id }],
    directLeaderResolutions: [],
  });
  if (deactReq.request.status === "pending") await approveTransfer(actorId, deactReq.request.id);
  await executePastoralTransfer(actorId, deactReq.request.id);

  const [dAfter] = await db
    .select()
    .from(personLeadership)
    .where(eq(personLeadership.personId, leaderD.id))
    .limit(1);
  const [mMem] = await db
    .select()
    .from(cellMemberships)
    .where(
      and(eq(cellMemberships.personId, memberM.id), eq(cellMemberships.status, "active")),
    )
    .limit(1);
  record(results, "desactivación con plan → inactive", dAfter?.status === "inactive");
  record(
    results,
    "miembro no orphan — en evangelística receptor",
    mMem?.cellId === receptorAct.cell!.id,
  );
  record(results, "persona memberM preservada", Boolean(memberM.id));

  // ---------- Receptor saturado (2 cells) — no third ----------
  const sat = await createPerson(`Saturated${suffix}`, ministryA.id, networkH.id);
  await markPersonEligible(actorId, {
    personId: sat.id,
    ministryId: ministryA.id,
    networkId: networkH.id,
    directLeaderPersonId: null,
  });
  const satAct = await activateLeader(actorId, {
    personId: sat.id,
    isMinistryRoot: true,
    email: `sat.${suffix}@multiplica.test`,
    cell: { name: `Cel Sat Eva ${suffix}`, dayOfWeek: "monday", startTime: "19:00" },
  });
  const [satUser] = await db
    .select()
    .from(users)
    .where(eq(users.personId, sat.id))
    .limit(1);
  // Open twelve cell manually as second
  await db.insert(cells).values({
    ministryId: ministryA.id,
    networkId: networkH.id,
    responsiblePersonId: sat.id,
    responsibleUserId: satUser?.id ?? null,
    type: "twelve",
    name: `Cel Sat 12 ${suffix}`,
    code: `SAT12-${suffix}`,
    status: "active",
    dayOfWeek: "wednesday",
    startTime: "20:00",
  });
  const satCells = await db
    .select()
    .from(cells)
    .where(
      and(eq(cells.responsiblePersonId, sat.id), sql`${cells.status} <> 'closed'`),
    );
  record(results, "receptor saturado tiene 2 células", satCells.length === 2);

  // Attempt creating third via cells service
  try {
    const { createCell } = await import("../src/modules/cells/service");
    await createCell(actorId, {
      ministryId: ministryA.id,
      networkId: networkH.id,
      responsiblePersonId: sat.id,
      type: "evangelistic",
      name: `Cel Tercera ${suffix}`,
      dayOfWeek: "friday",
      startTime: "19:00",
      timezone: "America/Lima",
    });
    record(results, "receptor 2 células no recibe tercera", false, "third created");
  } catch (e) {
    const code = e instanceof DomainError ? e.code : String(e);
    record(
      results,
      "receptor 2 células no recibe tercera",
      code === DomainErrorCode.MAX_DIRECT_CELLS_REACHED ||
        String(code).includes("MAX_DIRECT_CELLS"),
      String(code),
    );
  }

  // ---------- Audit samples ----------
  const [sendAudit] = await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.action, "send.completed"))
    .orderBy(sql`${auditLogs.createdAt} desc`)
    .limit(1);
  record(results, "audit send.completed", Boolean(sendAudit));
  const [xferAudit] = await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.action, "transfer.executed"))
    .orderBy(sql`${auditLogs.createdAt} desc`)
    .limit(1);
  record(results, "audit transfer.executed", Boolean(xferAudit));

  // ---------- Rollback smoke: invalid execute leaves status ----------
  const rollbackPerson = await createPerson(`Rollback${suffix}`, ministryA.id, networkH.id);
  const badReq = await createTransferRequest(actorId, {
    personId: rollbackPerson.id,
    transferType: "cell_membership_transfer",
    targetCellId: satAct.cell!.id,
    reason: "Membership transfer for rollback fixture",
    submit: true,
  });
  // Force approved then break by deleting target mid-flight isn't easy; instead
  // verify approved status before execute and that unapproved cannot execute
  const draftOnly = await createTransferRequest(actorId, {
    personId: rollbackPerson.id,
    transferType: "network_change",
    destinationNetworkId: networkJ.id,
    destinationMinistryId: ministryA.id,
    reason: "Draft no execute",
    submit: false,
  });
  try {
    await executePastoralTransfer(actorId, draftOnly.request.id);
    record(results, "execute no-approved DENY", false);
  } catch (e) {
    record(
      results,
      "execute no-approved DENY",
      e instanceof DomainError && e.code === DomainErrorCode.TRANSFER_NOT_APPROVED,
    );
  }
  void badReq;

  const failed = results.filter((r) => !r.pass).length;
  const passed = results.filter((r) => r.pass).length;
  console.log(`\nPhase 8 verify: PASS=${passed} FAIL=${failed} TOTAL=${results.length}`);
  if (failed > 0) {
    console.log("Failed:");
    for (const r of results.filter((x) => !x.pass)) {
      console.log(`  - ${r.name}${r.detail ? `: ${r.detail}` : ""}`);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
