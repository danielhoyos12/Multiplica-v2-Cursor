import { createClient } from "@supabase/supabase-js";
import { desc, eq } from "drizzle-orm";

import { getDb } from "../src/db/client";
import { auditLogs } from "../src/db/schema";
import {
  assignMinistryResponsible,
  createMinistry,
  listMinistriesForActor,
  setMinistryActive,
  updateMinistry,
} from "../src/modules/organization/service";

async function main() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 20 });
  const superUser =
    data.users.find((u) => (u.email || "").endsWith("icloud.com")) || data.users[0];

  const created = await createMinistry(superUser.id, {
    code: "LP3",
    name: "Ministerio Servicio",
    sortOrder: 3,
    isActive: true,
  });
  const updated = await updateMinistry(superUser.id, created.id, {
    name: "Ministerio Servicio Editado",
  });
  await setMinistryActive(superUser.id, created.id, false);
  await setMinistryActive(superUser.id, created.id, true);
  await assignMinistryResponsible(superUser.id, created.id, superUser.id);
  const listed = await listMinistriesForActor(superUser.id);
  const db = getDb();
  const audits = await db
    .select({ action: auditLogs.action })
    .from(auditLogs)
    .where(eq(auditLogs.entityId, created.id))
    .orderBy(desc(auditLogs.createdAt));

  console.log(
    JSON.stringify(
      {
        createdCode: created.code,
        updatedName: updated.name,
        listedHasLP3: listed.some((m) => m.code === "LP3"),
        auditActions: audits.map((a) => a.action),
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
