/**
 * Live Phase 3 verification against multiplica-dev.
 */
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "../src/db/client";
import {
  cellAttendance,
  cellAttendanceSessions,
  cellMemberships,
  ministries,
  networks,
  personOrganizationHistory,
  persons,
  roles,
  userRoleAssignments,
  users,
} from "../src/db/schema";
import {
  addMemberToCell,
  closeCell,
  convertEvangelisticToTwelve,
  createCell,
  listCellsForActor,
  reassignMember,
  removeMemberFromCell,
  saveCellAttendance,
} from "../src/modules/cells/service";
import { DomainErrorCode } from "../src/lib/errors";
import { loadAuthContext } from "../src/modules/authorization";

type Result = { name: string; pass: boolean; detail?: string };

function record(results: Result[], name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const results: Result[] = [];
  const db = getDb();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const ministryRows = await db
    .select()
    .from(ministries)
    .where(eq(ministries.isActive, true))
    .orderBy(ministries.code)
    .limit(2);
  const [ministryA, ministryB] = ministryRows;
  const [networkH] = await db
    .select()
    .from(networks)
    .where(eq(networks.code, "hombres"))
    .limit(1);
  const [ninos] = await db.select().from(networks).where(eq(networks.code, "ninos")).limit(1);

  record(results, "catalogs ready", Boolean(ministryA && ministryB && networkH));
  record(results, "Niños inactive", ninos?.isActive === false);

  const anon = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anonSelect = await anon.from("cells").select("id").limit(5);
  record(
    results,
    "anonymous cells SELECT DENY/empty",
    Boolean(anonSelect.error) || (anonSelect.data?.length ?? 0) === 0,
    anonSelect.error?.message ?? `rows=${anonSelect.data?.length ?? 0}`,
  );
  const anonInsert = await anon.from("cells").insert({
    name: "Hacker Cell",
    type: "evangelistic",
    ministry_id: ministryA?.id,
    network_id: networkH?.id,
    day_of_week: "monday",
    start_time: "19:00",
  });
  record(
    results,
    "anonymous cells INSERT DENY",
    Boolean(anonInsert.error),
    anonInsert.error?.message ?? "unexpected ok",
  );

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
  const actorUserId = superAssign?.userId;
  record(results, "superadmin actor", Boolean(actorUserId));

  if (!actorUserId || !ministryA || !ministryB || !networkH) {
    process.exit(1);
  }

  // Ensure persons in each ministry with hombres network
  async function ensurePerson(label: string, ministryId: string) {
    const phone = `7${String(Date.now()).slice(-8)}${label.length}`;
    const [person] = await db
      .insert(persons)
      .values({
        firstName: `Celula${label}`,
        lastName: "Prueba",
        phone,
        phoneNormalized: phone,
        address: "Calle Célula",
        source: "internal_form",
      })
      .returning();
    await db.insert(personOrganizationHistory).values({
      personId: person.id,
      ministryId,
      networkId: networkH!.id,
      changeReason: "phase3.verify",
    });
    return person;
  }

  const personA = await ensurePerson("A", ministryA.id);
  const personB = await ensurePerson("B", ministryB.id);
  const memberA2 = await ensurePerson("A2", ministryA.id);

  const cellA = await createCell(actorUserId, {
    name: `Célula Verify A ${Date.now()}`,
    type: "evangelistic",
    ministryId: ministryA.id,
    networkId: networkH.id,
    dayOfWeek: "wednesday",
    startTime: "19:30",
    timezone: "America/Lima",
    address: "Casa A",
  });
  record(results, "create cell ministry A", Boolean(cellA.id));

  const cellB = await createCell(actorUserId, {
    name: `Célula Verify B ${Date.now()}`,
    type: "evangelistic",
    ministryId: ministryB.id,
    networkId: networkH.id,
    dayOfWeek: "thursday",
    startTime: "20:00",
    timezone: "America/Lima",
  });
  record(results, "create cell ministry B", Boolean(cellB.id));

  let ninosBlocked = false;
  try {
    await createCell(actorUserId, {
      name: "Niños blocked",
      type: "evangelistic",
      ministryId: ministryA.id,
      networkId: ninos!.id,
      dayOfWeek: "friday",
      startTime: "18:00",
      timezone: "America/Lima",
    });
  } catch (error) {
    ninosBlocked =
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === DomainErrorCode.NETWORK_INACTIVE;
  }
  record(results, "Niños create blocked", ninosBlocked);

  await addMemberToCell(actorUserId, cellA.id, personA.id);
  record(results, "add member A to cell A", true);

  let dupBlocked = false;
  try {
    await addMemberToCell(actorUserId, cellA.id, personA.id);
  } catch (error) {
    dupBlocked =
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === DomainErrorCode.MEMBERSHIP_ALREADY_ACTIVE;
  }
  record(results, "duplicate membership blocked", dupBlocked);

  let crossAddBlocked = false;
  try {
    await addMemberToCell(actorUserId, cellA.id, personB.id);
  } catch {
    crossAddBlocked = true;
  }
  record(results, "cross-ministry member add blocked", crossAddBlocked);

  await addMemberToCell(actorUserId, cellA.id, memberA2.id);
  const cellA2 = await createCell(actorUserId, {
    name: `Célula Verify A2 ${Date.now()}`,
    type: "evangelistic",
    ministryId: ministryA.id,
    networkId: networkH.id,
    dayOfWeek: "monday",
    startTime: "19:00",
    timezone: "America/Lima",
  });
  const [membershipA2] = await db
    .select()
    .from(cellMemberships)
    .where(
      and(
        eq(cellMemberships.personId, memberA2.id),
        eq(cellMemberships.status, "active"),
      ),
    )
    .limit(1);
  await reassignMember(actorUserId, membershipA2.id, cellA2.id, "verify move");
  const history = await db
    .select()
    .from(cellMemberships)
    .where(eq(cellMemberships.personId, memberA2.id));
  record(
    results,
    "reassign preserves history",
    history.length >= 2 && history.some((h) => h.status === "transferred"),
  );

  const [membershipA] = await db
    .select()
    .from(cellMemberships)
    .where(
      and(eq(cellMemberships.personId, personA.id), eq(cellMemberships.status, "active")),
    )
    .limit(1);

  let closeBlocked = false;
  try {
    await closeCell(actorUserId, cellA.id);
  } catch (error) {
    closeBlocked =
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === DomainErrorCode.CELL_HAS_ACTIVE_MEMBERS;
  }
  record(results, "close with active members blocked", closeBlocked);

  await removeMemberFromCell(actorUserId, membershipA.id, "verify leave");
  const [personStill] = await db
    .select()
    .from(persons)
    .where(eq(persons.id, personA.id))
    .limit(1);
  record(results, "remove member keeps person", Boolean(personStill));

  // Re-add for attendance
  await addMemberToCell(actorUserId, cellA.id, personA.id);
  const sessionDate = new Date().toISOString().slice(0, 10);
  const [activeMem] = await db
    .select()
    .from(cellMemberships)
    .where(
      and(eq(cellMemberships.personId, personA.id), eq(cellMemberships.status, "active")),
    )
    .limit(1);
  await saveCellAttendance(actorUserId, cellA.id, {
    sessionDate,
    records: [
      {
        personId: personA.id,
        membershipId: activeMem.id,
        status: "present",
      },
    ],
  });
  const sessions = await db
    .select()
    .from(cellAttendanceSessions)
    .where(eq(cellAttendanceSessions.cellId, cellA.id));
  const attendanceRows = await db
    .select()
    .from(cellAttendance)
    .where(eq(cellAttendance.personId, personA.id));
  record(results, "attendance session + rows", sessions.length >= 1 && attendanceRows.length >= 1);

  let conversionBlocked = false;
  try {
    await convertEvangelisticToTwelve(actorUserId, cellA.id);
  } catch (error) {
    conversionBlocked =
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code ===
        DomainErrorCode.CELL_CONVERSION_PREREQUISITES_NOT_IMPLEMENTED;
  }
  record(results, "conversion not implemented", conversionBlocked);

  const listed = await listCellsForActor(actorUserId, { pageSize: 50 });
  record(
    results,
    "superadmin sees both cells",
    listed.rows.some((r) => r.id === cellA.id) && listed.rows.some((r) => r.id === cellB.id),
  );

  if (serviceKey) {
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const email = `phase3-leader-${Date.now()}@example.com`;
    const password = createHash("sha256").update(email).digest("hex").slice(0, 24) + "Aa1!";
    const createdUser = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    const leaderId = createdUser.data.user?.id;
    if (leaderId) {
      await db.insert(users).values({
        id: leaderId,
        email,
        displayName: "Leader Phase3",
        isActive: true,
      });
      const [leaderRole] = await db
        .select()
        .from(roles)
        .where(eq(roles.code, "leader_general"))
        .limit(1);
      if (leaderRole) {
        await db.insert(userRoleAssignments).values({
          userId: leaderId,
          roleId: leaderRole.id,
          ministryId: ministryB.id,
          createdByUserId: actorUserId,
        });
      }
      await loadAuthContext(leaderId);
      const scoped = await listCellsForActor(leaderId, { pageSize: 50 });
      record(
        results,
        "leader B isolation",
        scoped.rows.every((r) => r.ministryId === ministryB.id) &&
          !scoped.rows.some((r) => r.id === cellA.id),
        `rows=${scoped.total}`,
      );
      await admin.auth.admin.deleteUser(leaderId);
    } else {
      record(results, "leader B isolation", false, createdUser.error?.message);
    }
  } else {
    record(results, "leader B isolation", false, "no service role");
  }

  // client secret scan
  const { readdirSync, readFileSync, existsSync } = await import("node:fs");
  const { join } = await import("node:path");
  let secretHit = false;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const databaseUrl = process.env.DATABASE_URL;
  if (existsSync(".next/static")) {
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (/\.(js|json|html|txt)$/.test(entry.name)) {
          const text = readFileSync(p, "utf8");
          if (serviceRole && text.includes(serviceRole)) secretHit = true;
          if (databaseUrl && text.includes(databaseUrl)) secretHit = true;
        }
      }
    };
    walk(".next/static");
  }
  record(results, "no secrets in client bundles", !secretHit);

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
