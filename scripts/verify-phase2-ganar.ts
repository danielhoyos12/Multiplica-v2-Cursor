/**
 * Live Phase 2 verification against multiplica-dev.
 * Run: npx tsx --env-file=.env.local scripts/verify-phase2-ganar.ts
 */
import { createHash } from "node:crypto";

import {
  createEphemeralClerkUser,
  deleteClerkUser,
  recordInterimDatabaseReady,
} from "./lib/verify-env";
import { hasClerkSecret } from "../src/lib/env";
import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "../src/db/client";
import {
  auditLogs,
  districts,
  ministries,
  networks,
  personIntakeEvents,
  personOrganizationHistory,
  userRoleAssignments,
  users,
  roles,
} from "../src/db/schema";
import {
  createPersonInternal,
  createPersonPublic,
  findDuplicateCandidates,
  listPersonsForActor,
  updatePersonForActor,
} from "../src/modules/ganar/service";
import { loadAuthContext } from "../src/modules/authorization";

type Result = { name: string; pass: boolean; detail?: string };

function record(results: Result[], name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const results: Result[] = [];
  record(results, "CLERK_SECRET_KEY present", hasClerkSecret());
  if (!recordInterimDatabaseReady(results)) {
    console.log("\nPhase 2 verify skipped — interim DB unavailable");
    process.exit(1);
  }
  const db = getDb();
  const serviceKey = process.env.CLERK_SECRET_KEY;

  const [ministryA, ministryB] = await db
    .select()
    .from(ministries)
    .where(eq(ministries.isActive, true))
    .orderBy(ministries.code)
    .limit(2);
  const [network] = await db
    .select()
    .from(networks)
    .where(and(eq(networks.isActive, true), eq(networks.code, "hombres")))
    .limit(1);
  const [district] = await db
    .select()
    .from(districts)
    .where(eq(districts.isActive, true))
    .limit(1);
  const [ninos] = await db.select().from(networks).where(eq(networks.code, "ninos")).limit(1);

  record(results, "catalogs ready", Boolean(ministryA && network && district));
  record(results, "Niños inactive", ninos?.isActive === false);

  // Find a superadmin actor
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
  record(results, "superadmin actor present", Boolean(actorUserId), actorUserId ?? "none");

  if (actorUserId && ministryA && network && district) {
    const phone = `9${String(Date.now()).slice(-8)}`;
    const created = await createPersonInternal(actorUserId, {
      fullName: "Persona Verificación Fase Dos",
      phone,
      address: "Av. Verificación 100",
      districtId: district.id,
      prayerRequest: "Petición confidencial de prueba",
      ministryId: ministryA.id,
      networkId: network.id,
      forceCreate: false,
    });
    record(results, "internal create", Boolean(created.personId), created.personId);

    const hist = await db
      .select()
      .from(personOrganizationHistory)
      .where(
        and(
          eq(personOrganizationHistory.personId, created.personId),
          isNull(personOrganizationHistory.effectiveTo),
        ),
      );
    record(results, "organization history open row", hist.length === 1);

    const audits = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, created.personId))
      .limit(10);
    const createdAudit = audits.find((a) => a.action === "person.created.internal");
    const auditJson = JSON.stringify(createdAudit ?? {});
    record(
      results,
      "audit person.created.internal without prayer text",
      Boolean(createdAudit) && !auditJson.includes("Petición confidencial"),
    );

    // Strong duplicate detection
    const dups = await findDuplicateCandidates({
      phone,
      firstName: "Persona",
      lastName: "Verificación Fase Dos",
    });
    record(
      results,
      "strong duplicate detection",
      dups.some((d) => d.strength === "strong"),
      String(dups.length),
    );

    const blocked = await createPersonInternal(actorUserId, {
      fullName: "Persona Verificación Fase Dos",
      phone,
      address: "Av. Verificación 100",
      districtId: district.id,
      ministryId: ministryA.id,
      networkId: network.id,
      forceCreate: false,
    });
    record(
      results,
      "internal duplicate warn (no new create)",
      Boolean(blocked.duplicates?.length),
      blocked.personId,
    );

    // Public create (neutral on duplicate)
    const publicOk = await createPersonPublic(
      {
        fullName: "Persona Verificación Fase Dos",
        phone,
        address: "Av. Pública 1",
        districtId: district.id,
        ministryId: ministryA.id,
        networkId: network.id,
        prayerRequest: "secreto público",
      },
      { ip: "203.0.113.10", userAgent: "verify-script" },
    );
    record(results, "public duplicate silent success", publicOk.ok === true);

    const intake = await db
      .select()
      .from(personIntakeEvents)
      .where(eq(personIntakeEvents.outcome, "duplicate_silent"))
      .limit(1);
    record(results, "intake duplicate_silent logged", intake.length >= 1);

    const phone2 = `8${String(Date.now()).slice(-8)}`;
    const publicCreate = await createPersonPublic(
      {
        fullName: "Persona Pública Nueva",
        phone: phone2,
        address: "Calle Pública 2",
        districtId: district.id,
        ministryId: ministryA.id,
        networkId: network.id,
        prayerRequest: "otra petición",
      },
      { ip: "203.0.113.11", userAgent: "verify-script" },
    );
    record(results, "public create via boundary", publicCreate.ok === true);

    const listed = await listPersonsForActor(actorUserId, { pageSize: 5 });
    record(results, "superadmin list persons", listed.total >= 1, `total=${listed.total}`);

    // Cross-ministry deny with synthetic leader context if second ministry exists
    if (ministryB && serviceKey) {
      const email = `phase2-leader-${Date.now()}@example.com`;
      const password = createHash("sha256").update(email).digest("hex").slice(0, 24) + "Aa1!";
      try {
        const ephemeral = await createEphemeralClerkUser(email, password);
        const [inserted] = await db
          .insert(users)
          .values({
            clerkUserId: ephemeral.clerkUserId,
            email,
            displayName: "Leader Phase2",
            isActive: true,
          })
          .returning({ id: users.id });
        const leaderId = inserted.id;
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

        const leaderAuth = await loadAuthContext(leaderId);
        record(
          results,
          "leader_general scoped to ministry B",
          leaderAuth.ministryIds.includes(ministryB.id) &&
            !leaderAuth.ministryIds.includes(ministryA.id),
        );

        let denied = false;
        try {
          await updatePersonForActor(leaderId, created.personId, {
            address: "Hack cross ministry",
          });
        } catch {
          denied = true;
        }
        record(results, "cross-ministry edit DENY", denied);

        const scopedList = await listPersonsForActor(leaderId, { pageSize: 50 });
        const leaked = scopedList.rows.some((r) => r.id === created.personId);
        record(results, "cross-ministry list isolation", !leaked, `rows=${scopedList.total}`);

        await deleteClerkUser(ephemeral.clerkUserId);
      } catch (e) {
        record(results, "leader user create", false, e instanceof Error ? e.message : String(e));
      }
    } else {
      record(
        results,
        "cross-ministry probes",
        false,
        "need second ministry + CLERK_SECRET_KEY",
      );
    }
  }

  // Bundle secret scan — client artifacts only
  const { readdirSync, readFileSync, existsSync } = await import("node:fs");
  const { join } = await import("node:path");
  let secretHit = false;
  const serviceRole = process.env.CLERK_SECRET_KEY;
  const databaseUrl = process.env.DATABASE_URL;
  const scanRoot = ".next/static";
  if (existsSync(scanRoot)) {
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(p);
          continue;
        }
        if (!/\.(js|json|html|txt)$/.test(entry.name)) continue;
        const text = readFileSync(p, "utf8");
        if (serviceRole && text.includes(serviceRole)) secretHit = true;
        if (databaseUrl && text.includes(databaseUrl)) secretHit = true;
      }
    };
    walk(scanRoot);
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
