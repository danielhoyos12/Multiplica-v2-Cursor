/**
 * Official MULTIPLICA formation catalog + eligibility chain (Phase 7 reconciliation).
 *
 * Sequence:
 * GANAR → CONSOLIDAR (Pre → Encuentro → Post) → DISCIPULAR
 *   (CD1 → CD2 → Re-Encuentro → CD3 → EM1 → EM2 → EM3) → ENVIAR eligible
 *
 * UDV is NOT a gate. Legacy process_types are preserved but deprecated.
 */
import { and, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  CONSOLIDAR_FAMILY,
  DESTINO_FAMILY,
  DESTINO_N1_CODE,
  DESTINO_N2_CODE,
  DESTINO_N3_CODE,
  DISCIPULAR_FAMILY,
  EM1_CODE,
  EM2_CODE,
  EM3_CODE,
  EM_FAMILY,
  ENCUENTRO_CODE,
  POST_ENCUENTRO_CODE,
  PRE_ENCUENTRO_CODE,
  REENCUENTRO_FAMILY,
  REENCUENTRO_PROGRAM_CODE,
  personProcessProgress,
  trainingCompletionRequirements,
  trainingModules,
  trainingPrograms,
} from "@/db/schema";

export type OfficialProcess =
  | "pre_encuentro"
  | "encuentro"
  | "post_encuentro"
  | "destino_n1"
  | "destino_n2"
  | "reencuentro"
  | "destino_n3"
  | "em1"
  | "em2"
  | "em3";

export const OFFICIAL_SEQUENCE: OfficialProcess[] = [
  "pre_encuentro",
  "encuentro",
  "post_encuentro",
  "destino_n1",
  "destino_n2",
  "reencuentro",
  "destino_n3",
  "em1",
  "em2",
  "em3",
];

export const LEGACY_PROCESS_NOTES = {
  udv: "DEPRECATED — not a gate between Post-Encuentro and CD1",
  destino: "DEPRECATED aggregate signal",
  escuela_ministerial: "DEPRECATED — replaced by em1|em2|em3",
  destino_n1: "ACTIVE technical code for Capacitación Destino 1",
  destino_n2: "ACTIVE technical code for Capacitación Destino 2",
  destino_n3: "ACTIVE technical code for Capacitación Destino 3",
  reencuentro: "ACTIVE — position corrected to between CD2 and CD3",
} as const;

type ProgramSeed = {
  code: string;
  name: string;
  family: string;
  level?: number | null;
  processType: OfficialProcess | "consolidar";
  modules: Array<{
    code: string;
    name: string;
    orderIndex: number;
    componentCode?: string | null;
    componentName?: string | null;
  }>;
  academicRequirement?: boolean;
};

function doctrinaSeminarioModules(prefix: string) {
  const mods = [];
  for (let i = 1; i <= 10; i++) {
    const n = String(i).padStart(2, "0");
    mods.push({
      code: `D${n}`,
      name: `Clase ${i}`,
      orderIndex: i,
      componentCode: "doctrina",
      componentName: "Doctrina",
    });
  }
  for (let i = 1; i <= 10; i++) {
    const n = String(i).padStart(2, "0");
    mods.push({
      code: `S${n}`,
      name: `Clase ${i}`,
      orderIndex: 100 + i,
      componentCode: "seminario",
      componentName: "Seminario",
    });
  }
  void prefix;
  return mods;
}

export const OFFICIAL_PROGRAM_SEEDS: ProgramSeed[] = [
  {
    code: PRE_ENCUENTRO_CODE,
    name: "Pre-Encuentro",
    family: CONSOLIDAR_FAMILY,
    processType: "pre_encuentro",
    modules: [1, 2, 3, 4].map((i) => ({
      code: `C${i}`,
      name: `Clase ${i}`,
      orderIndex: i,
      componentCode: "clase",
      componentName: "Clases",
    })),
    academicRequirement: true,
  },
  {
    code: ENCUENTRO_CODE,
    name: "Encuentro",
    family: CONSOLIDAR_FAMILY,
    processType: "encuentro",
    // 3 pastoral days represented as 3 modules (Dia 1–3)
    modules: [1, 2, 3].map((i) => ({
      code: `DIA${i}`,
      name: `Día ${i}`,
      orderIndex: i,
      componentCode: "dia",
      componentName: "Encuentro (3 días)",
    })),
    academicRequirement: true,
  },
  {
    code: POST_ENCUENTRO_CODE,
    name: "Post-Encuentro",
    family: CONSOLIDAR_FAMILY,
    processType: "post_encuentro",
    modules: [1, 2, 3, 4].map((i) => ({
      code: `C${i}`,
      name: `Clase ${i}`,
      orderIndex: i,
      componentCode: "clase",
      componentName: "Clases",
    })),
    academicRequirement: true,
  },
  {
    code: DESTINO_N1_CODE,
    name: "Capacitación Destino 1",
    family: DISCIPULAR_FAMILY,
    level: 1,
    processType: "destino_n1",
    modules: doctrinaSeminarioModules("cd1"),
    academicRequirement: true,
  },
  {
    code: DESTINO_N2_CODE,
    name: "Capacitación Destino 2",
    family: DISCIPULAR_FAMILY,
    level: 2,
    processType: "destino_n2",
    modules: doctrinaSeminarioModules("cd2"),
    academicRequirement: true,
  },
  {
    code: REENCUENTRO_PROGRAM_CODE,
    name: "Re-Encuentro",
    family: REENCUENTRO_FAMILY,
    processType: "reencuentro",
    modules: [
      {
        code: "RE-EVENT",
        name: "Evento Re-Encuentro",
        orderIndex: 1,
        componentCode: "evento",
        componentName: "Evento",
      },
    ],
    academicRequirement: true,
  },
  {
    code: DESTINO_N3_CODE,
    name: "Capacitación Destino 3",
    family: DISCIPULAR_FAMILY,
    level: 3,
    processType: "destino_n3",
    modules: doctrinaSeminarioModules("cd3"),
    academicRequirement: true,
  },
  {
    code: EM1_CODE,
    name: "Escuela Ministerial 1",
    family: EM_FAMILY,
    level: 1,
    processType: "em1",
    modules: doctrinaSeminarioModules("em1"),
    academicRequirement: true,
  },
  {
    code: EM2_CODE,
    name: "Escuela Ministerial 2",
    family: EM_FAMILY,
    level: 2,
    processType: "em2",
    modules: doctrinaSeminarioModules("em2"),
    academicRequirement: true,
  },
  {
    code: EM3_CODE,
    name: "Escuela Ministerial 3",
    family: EM_FAMILY,
    level: 3,
    processType: "em3",
    modules: doctrinaSeminarioModules("em3"),
    academicRequirement: true,
  },
];

/** Idempotent official catalog seed. Does not invent doctrinal class names. */
export async function ensureOfficialCatalog() {
  const db = getDb();
  const results = [];

  // Keep Destino family label aligned to discipular for CD codes when seeding
  for (const seed of OFFICIAL_PROGRAM_SEEDS) {
    const family =
      seed.code.startsWith("destino_") || seed.code === REENCUENTRO_PROGRAM_CODE
        ? seed.family === DISCIPULAR_FAMILY || seed.family === REENCUENTRO_FAMILY
          ? seed.family
          : DISCIPULAR_FAMILY
        : seed.family;

    let [program] = await db
      .select()
      .from(trainingPrograms)
      .where(eq(trainingPrograms.code, seed.code))
      .limit(1);

    if (!program) {
      [program] = await db
        .insert(trainingPrograms)
        .values({
          code: seed.code,
          name: seed.name,
          description: seed.name,
          family,
          level: seed.level ?? null,
          isActive: true,
        })
        .returning();
    } else {
      [program] = await db
        .update(trainingPrograms)
        .set({
          name: seed.name,
          family,
          level: seed.level ?? null,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(trainingPrograms.id, program.id))
        .returning();
    }

    const existing = await db
      .select()
      .from(trainingModules)
      .where(eq(trainingModules.programId, program.id));
    const byCode = new Map(existing.map((m) => [m.code, m]));

    for (const mod of seed.modules) {
      const row = byCode.get(mod.code);
      if (!row) {
        await db.insert(trainingModules).values({
          programId: program.id,
          code: mod.code,
          name: mod.name,
          orderIndex: mod.orderIndex,
          componentCode: mod.componentCode ?? null,
          componentName: mod.componentName ?? null,
          isActive: true,
          isRequired: true,
        });
      } else if (
        row.componentCode !== (mod.componentCode ?? null) ||
        row.componentName !== (mod.componentName ?? null) ||
        row.name !== mod.name ||
        !row.isActive
      ) {
        await db
          .update(trainingModules)
          .set({
            name: mod.name,
            componentCode: mod.componentCode ?? null,
            componentName: mod.componentName ?? null,
            orderIndex: mod.orderIndex,
            isActive: true,
            updatedAt: new Date(),
          })
          .where(eq(trainingModules.id, row.id));
      }
    }

    // Deactivate legacy modules not in the official seed for this program
    const seedCodes = new Set(seed.modules.map((m) => m.code));
    for (const row of existing) {
      if (!seedCodes.has(row.code) && row.isActive) {
        await db
          .update(trainingModules)
          .set({
            isActive: false,
            updatedAt: new Date(),
            name: `${row.name} [legacy inactive]`,
          })
          .where(eq(trainingModules.id, row.id));
      }
    }

    if (seed.academicRequirement) {
      const reqs = await db
        .select()
        .from(trainingCompletionRequirements)
        .where(eq(trainingCompletionRequirements.programId, program.id));
      // Clear pastoral active_cell_members defaults that were hard-seeded on Destino
      // unless explicitly required — deactivate unverified 12-person reqs.
      for (const req of reqs) {
        if (req.requirementType === "active_cell_members" && req.isActive) {
          await db
            .update(trainingCompletionRequirements)
            .set({
              isActive: false,
              updatedAt: new Date(),
              label: `${req.label ?? "12 personas"} (desactivado — no confirmado por nivel)`,
            })
            .where(eq(trainingCompletionRequirements.id, req.id));
        }
      }
      const hasAcademic = reqs.some(
        (r) =>
          r.isActive &&
          (r.requirementType === "manual_approval" || r.category === "academic"),
      );
      if (!hasAcademic) {
        await db.insert(trainingCompletionRequirements).values({
          programId: program.id,
          requirementType: "manual_approval",
          category: "academic",
          label: "Componente académico aprobado",
          isRequired: true,
          isActive: true,
        });
      }
    }

    results.push(program);
  }

  // Mark legacy UDV / single EM as inactive umbrella catalogs (keep rows)
  for (const legacy of ["udv", "escuela_ministerial", "destino"] as const) {
    const [row] = await db
      .select()
      .from(trainingPrograms)
      .where(eq(trainingPrograms.code, legacy))
      .limit(1);
    if (row && row.isActive) {
      await db
        .update(trainingPrograms)
        .set({
          isActive: false,
          description: `${row.description ?? ""} [DEPRECATED — Phase 7 reconciliation]`.trim(),
          updatedAt: new Date(),
        })
        .where(eq(trainingPrograms.id, row.id));
    }
  }

  // Align Destino family label for CD programs to discipular
  await db
    .update(trainingPrograms)
    .set({ family: DISCIPULAR_FAMILY, updatedAt: new Date() })
    .where(
      and(
        eq(trainingPrograms.family, DESTINO_FAMILY),
      ),
    );

  return results;
}

export function countCatalogExpectation() {
  return {
    pre: 4,
    encuentroDays: 3,
    post: 4,
    cdDoctrina: 10,
    cdSeminario: 10,
    emDoctrina: 10,
    emSeminario: 10,
  };
}

export async function getProgressStatus(
  personId: string,
  processType: string,
): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ status: personProcessProgress.status })
    .from(personProcessProgress)
    .where(
      and(
        eq(personProcessProgress.personId, personId),
        eq(personProcessProgress.processType, processType as never),
      ),
    )
    .limit(1);
  return row?.status ?? null;
}

export function isCompleted(status: string | null | undefined) {
  return status === "completed";
}

/** Pure eligibility rules for the official sequence. */
export const OfficialEligibility = {
  preEncuentro() {
    return true; // GANAR person exists — caller checks person
  },
  encuentro(preStatus: string | null) {
    return isCompleted(preStatus);
  },
  postEncuentro(encuentroStatus: string | null) {
    return isCompleted(encuentroStatus);
  },
  consolidar(pre: string | null, enc: string | null, post: string | null) {
    return isCompleted(pre) && isCompleted(enc) && isCompleted(post);
  },
  cd1(consolidarStatus: string | null) {
    return isCompleted(consolidarStatus);
  },
  cd2(cd1: string | null) {
    return isCompleted(cd1);
  },
  reencuentro(cd2: string | null) {
    return isCompleted(cd2);
  },
  /** CD3 requires CD2 AND Re-Encuentro — NOT EM. */
  cd3(cd2: string | null, reencuentro: string | null) {
    return isCompleted(cd2) && isCompleted(reencuentro);
  },
  em1(cd3: string | null) {
    return isCompleted(cd3);
  },
  em2(em1: string | null) {
    return isCompleted(em1);
  },
  em3(em2: string | null) {
    return isCompleted(em2);
  },
  nextStage(em3: string | null) {
    return isCompleted(em3);
  },
  /** UDV must never gate CD1. */
  udvIsNotGateBeforeCd1: true as const,
  /** Wrong legacy rule: EM complete → Reencuentro. */
  reencuentroNotAfterEm: true as const,
};
