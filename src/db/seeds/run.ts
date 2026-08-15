import "dotenv/config";

import { and, eq } from "drizzle-orm";

import { getDb } from "../client";
import {
  networks,
  districts,
  roles,
  permissions,
  rolePermissions,
} from "../schema";
import {
  LIMA_METROPOLITANA_DISTRICTS,
  NETWORK_SEEDS,
  PERMISSION_SEEDS,
  ROLE_PERMISSION_MAP,
  ROLE_SEEDS,
} from "./data";
import { trainingModules, trainingPrograms, UDV_PROGRAM_CODE } from "../schema";
import {
  DESTINO_FAMILY,
  DESTINO_N1_CODE,
  DESTINO_N2_CODE,
  DESTINO_N3_CODE,
  trainingCompletionRequirements,
} from "../schema";

async function seedNetworks(db: ReturnType<typeof getDb>) {
  for (const network of NETWORK_SEEDS) {
    const existing = await db
      .select({ id: networks.id })
      .from(networks)
      .where(eq(networks.code, network.code))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(networks).values(network);
    } else {
      await db
        .update(networks)
        .set({
          name: network.name,
          isActive: network.isActive,
          isConfigurable: network.isConfigurable,
          sortOrder: network.sortOrder,
          updatedAt: new Date(),
        })
        .where(eq(networks.code, network.code));
    }
  }
}

async function seedDistricts(db: ReturnType<typeof getDb>) {
  for (const name of LIMA_METROPOLITANA_DISTRICTS) {
    const existing = await db
      .select({ id: districts.id })
      .from(districts)
      .where(eq(districts.name, name))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(districts).values({
        name,
        metroArea: "Lima Metropolitana",
        isActive: true,
      });
    }
  }
}

async function seedRbac(db: ReturnType<typeof getDb>) {
  for (const role of ROLE_SEEDS) {
    const existing = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.code, role.code))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(roles).values(role);
    } else {
      await db
        .update(roles)
        .set({
          name: role.name,
          description: role.description,
          scopeType: role.scopeType,
          updatedAt: new Date(),
        })
        .where(eq(roles.code, role.code));
    }
  }

  for (const permission of PERMISSION_SEEDS) {
    const existing = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(eq(permissions.code, permission.code))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(permissions).values(permission);
    } else {
      await db
        .update(permissions)
        .set({
          name: permission.name,
          description: permission.description,
          updatedAt: new Date(),
        })
        .where(eq(permissions.code, permission.code));
    }
  }

  const allRoles = await db.select().from(roles);
  const allPermissions = await db.select().from(permissions);
  const roleByCode = new Map(allRoles.map((role) => [role.code, role]));
  const permissionByCode = new Map(
    allPermissions.map((permission) => [permission.code, permission]),
  );

  for (const [roleCode, permissionCodes] of Object.entries(ROLE_PERMISSION_MAP)) {
    const role = roleByCode.get(roleCode);
    if (!role) continue;

    for (const permissionCode of permissionCodes) {
      const permission = permissionByCode.get(permissionCode);
      if (!permission) continue;

      const link = await db
        .select({ roleId: rolePermissions.roleId })
        .from(rolePermissions)
        .where(
          and(
            eq(rolePermissions.roleId, role.id),
            eq(rolePermissions.permissionId, permission.id),
          ),
        )
        .limit(1);

      if (link.length === 0) {
        await db.insert(rolePermissions).values({
          roleId: role.id,
          permissionId: permission.id,
        });
      }
    }
  }
}

async function seedUdvCatalog(db: ReturnType<typeof getDb>) {
  let [program] = await db
    .select()
    .from(trainingPrograms)
    .where(eq(trainingPrograms.code, UDV_PROGRAM_CODE))
    .limit(1);
  if (!program) {
    [program] = await db
      .insert(trainingPrograms)
      .values({
        code: UDV_PROGRAM_CODE,
        name: "Universidad de la Vida",
        description: "Programa pastoral previo a Capacitación Destino.",
        isActive: true,
      })
      .returning();
  }

  const existing = await db
    .select()
    .from(trainingModules)
    .where(eq(trainingModules.programId, program.id));
  if (existing.length === 0) {
    await db.insert(trainingModules).values([
      {
        programId: program.id,
        code: "M1",
        name: "Módulo 1",
        orderIndex: 1,
        isActive: true,
        isRequired: true,
      },
      {
        programId: program.id,
        code: "M2",
        name: "Módulo 2",
        orderIndex: 2,
        isActive: true,
        isRequired: true,
      },
      {
        programId: program.id,
        code: "M3",
        name: "Módulo 3",
        orderIndex: 3,
        isActive: true,
        isRequired: true,
      },
      {
        programId: program.id,
        code: "M4",
        name: "Módulo 4",
        orderIndex: 4,
        isActive: true,
        isRequired: true,
      },
    ]);
  }
}

async function seedDestinoCatalog(db: ReturnType<typeof getDb>) {
  const defs = [
    { code: DESTINO_N1_CODE, name: "Destino Nivel 1", level: 1 },
    { code: DESTINO_N2_CODE, name: "Destino Nivel 2", level: 2 },
    { code: DESTINO_N3_CODE, name: "Destino Nivel 3", level: 3 },
  ] as const;

  for (const def of defs) {
    let [program] = await db
      .select()
      .from(trainingPrograms)
      .where(eq(trainingPrograms.code, def.code))
      .limit(1);
    if (!program) {
      [program] = await db
        .insert(trainingPrograms)
        .values({
          code: def.code,
          name: def.name,
          description: `Capacitación Destino — Nivel ${def.level}`,
          level: def.level,
          family: DESTINO_FAMILY,
          isActive: true,
        })
        .returning();
    } else {
      await db
        .update(trainingPrograms)
        .set({
          family: DESTINO_FAMILY,
          level: def.level,
          name: def.name,
          updatedAt: new Date(),
        })
        .where(eq(trainingPrograms.id, program.id));
    }

    const modules = await db
      .select()
      .from(trainingModules)
      .where(eq(trainingModules.programId, program.id));
    if (modules.length === 0) {
      await db.insert(trainingModules).values(
        [1, 2, 3, 4].map((n) => ({
          programId: program.id,
          code: `M${n}`,
          name: `Módulo ${n}`,
          orderIndex: n,
          isActive: true,
          isRequired: true,
        })),
      );
    }

    const reqs = await db
      .select()
      .from(trainingCompletionRequirements)
      .where(eq(trainingCompletionRequirements.programId, program.id));
    if (reqs.length === 0) {
      await db.insert(trainingCompletionRequirements).values([
        {
          programId: program.id,
          requirementType: "manual_approval",
          category: "academic",
          label: "Componente académico aprobado",
          isRequired: true,
          isActive: true,
        },
        {
          programId: program.id,
          requirementType: "active_cell_members",
          numericValue: 12,
          category: "pastoral",
          label: "12 personas activas en célula evangelística",
          isRequired: true,
          isActive: true,
        },
      ]);
    }
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required to run seeds.");
    process.exit(1);
  }

  const db = getDb();

  console.log("Seeding networks...");
  await seedNetworks(db);

  console.log("Seeding Lima Metropolitana districts...");
  await seedDistricts(db);

  console.log("Seeding roles and permissions...");
  await seedRbac(db);

  console.log("Seeding Universidad de la Vida catalog...");
  await seedUdvCatalog(db);

  console.log("Seeding Capacitación Destino catalog...");
  await seedDestinoCatalog(db);

  console.log(
    "Seeds completed. Ministries Generales are NOT seeded (Superadmin setup).",
  );
  process.exit(0);
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
