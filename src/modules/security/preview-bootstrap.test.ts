import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  LIMA_METROPOLITANA_DISTRICTS,
  NETWORK_SEEDS,
  PERMISSION_SEEDS,
  ROLE_PERMISSION_MAP,
  ROLE_SEEDS,
} from "@/db/seeds/data";
import {
  ALLOW_PREVIEW_BOOTSTRAP_ENV,
  assertPreviewBootstrapAllowed,
  seedFoundationCatalogs,
} from "../../../convex/lib/seedFoundation";

function readSrc(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

const FOUNDATION_TABLES = [
  "networks",
  "districts",
  "roles",
  "permissions",
  "rolePermissions",
] as const;

const FORBIDDEN_TABLES = [
  "ministries",
  "persons",
  "users",
  "userRoleAssignments",
] as const;

type StoredDoc = Record<string, unknown> & { _id: string };

type EqChain = {
  eq: (field: string, value: unknown) => EqChain;
};

function createCatalogCtx() {
  const store = new Map<string, Map<string, StoredDoc>>();
  const insertLog: string[] = [];
  let seq = 0;

  const tableMap = (table: string) => {
    let rows = store.get(table);
    if (!rows) {
      rows = new Map();
      store.set(table, rows);
    }
    return rows;
  };

  const ctx = {
    db: {
      insert: async (table: string, doc: Record<string, unknown>) => {
        insertLog.push(table);
        if ((FORBIDDEN_TABLES as readonly string[]).includes(table)) {
          throw new Error(`unexpected insert into ${table}`);
        }
        const id = `${table}:${++seq}`;
        tableMap(table).set(id, { ...doc, _id: id });
        return id;
      },
      patch: async (table: string, id: string, patch: Record<string, unknown>) => {
        const row = tableMap(table).get(id);
        if (!row) throw new Error(`missing ${table} ${id}`);
        Object.assign(row, patch);
      },
      query: (table: string) => ({
        withIndex: (_name: string, build: (q: EqChain) => EqChain) => {
          const clauses: Array<[string, unknown]> = [];
          const q: EqChain = {
            eq(field: string, value: unknown) {
              clauses.push([field, value]);
              return q;
            },
          };
          build(q);
          return {
            unique: async () => {
              for (const row of tableMap(table).values()) {
                if (clauses.every(([field, value]) => row[field] === value)) {
                  return row;
                }
              }
              return null;
            },
          };
        },
      }),
    },
    rows: (table: string) => [...(store.get(table)?.values() ?? [])],
    insertLog,
  };

  return ctx;
}

describe("seed:bootstrapPreview source contracts", () => {
  const seedSrc = readSrc("convex/seed.ts");
  const helperSrc = readSrc("convex/lib/seedFoundation.ts");

  it("is internal-only with empty args", () => {
    expect(seedSrc).toMatch(/import \{ internalMutation \} from "\.\/_generated\/server"/);
    expect(seedSrc).not.toMatch(/import \{[^}]*\bmutation\b/);
    expect(seedSrc).toMatch(
      /export const bootstrapPreview = internalMutation\(\{\s*args: \{\}/,
    );
    expect(seedSrc).toMatch(
      /export const seedCatalogs = internalMutation\(\{\s*args: \{\}/,
    );
  });

  it("reuses seedFoundationCatalogs for both entrypoints", () => {
    expect(seedSrc).toMatch(
      /seedCatalogs = internalMutation\([\s\S]*handler: async \(ctx\) => seedFoundationCatalogs\(ctx\)/,
    );
    expect(seedSrc).toMatch(/assertPreviewBootstrapAllowed\(\);/);
    expect(seedSrc).toMatch(/return await seedFoundationCatalogs\(ctx\);/);
    expect(helperSrc).toMatch(/export async function seedFoundationCatalogs/);
  });

  it("does not call users, persons, ministries, Clerk, or formation", () => {
    for (const src of [seedSrc, helperSrc]) {
      expect(src).not.toMatch(/ctx\.db\.insert\("users"/);
      expect(src).not.toMatch(/ctx\.db\.insert\("persons"/);
      expect(src).not.toMatch(/ctx\.db\.insert\("ministries"/);
      expect(src).not.toMatch(/ctx\.db\.insert\("userRoleAssignments"/);
      expect(src).not.toMatch(/seedOfficialCatalog\(/);
      expect(src).not.toMatch(/seedSuperadminRole\(/);
      expect(src).not.toMatch(/clerkClient/);
      expect(src).not.toMatch(/@clerk\//);
      expect(src).not.toMatch(/from "\.\/formation"/);
      expect(src).not.toMatch(/from "\.\/users"/);
      expect(src).not.toMatch(/from "\.\/persons"/);
      expect(src).not.toMatch(/from "\.\/organization"/);
    }
    expect(helperSrc).toMatch(/ctx\.db\.insert\("networks"/);
    expect(helperSrc).toMatch(/ctx\.db\.insert\("districts"/);
    expect(helperSrc).toMatch(/ctx\.db\.insert\("roles"/);
    expect(helperSrc).toMatch(/ctx\.db\.insert\("permissions"/);
    expect(helperSrc).toMatch(/ctx\.db\.insert\("rolePermissions"/);
  });
});

describe("assertPreviewBootstrapAllowed", () => {
  const previous = process.env[ALLOW_PREVIEW_BOOTSTRAP_ENV];

  afterEach(() => {
    if (previous === undefined) {
      delete process.env[ALLOW_PREVIEW_BOOTSTRAP_ENV];
    } else {
      process.env[ALLOW_PREVIEW_BOOTSTRAP_ENV] = previous;
    }
  });

  it('fails if ALLOW_PREVIEW_BOOTSTRAP is not exactly "true"', () => {
    delete process.env[ALLOW_PREVIEW_BOOTSTRAP_ENV];
    expect(() => assertPreviewBootstrapAllowed()).toThrow(/Preview-only/);

    process.env[ALLOW_PREVIEW_BOOTSTRAP_ENV] = "";
    expect(() => assertPreviewBootstrapAllowed()).toThrow(/ALLOW_PREVIEW_BOOTSTRAP/);

    process.env[ALLOW_PREVIEW_BOOTSTRAP_ENV] = "TRUE";
    expect(() => assertPreviewBootstrapAllowed()).toThrow(/ALLOW_PREVIEW_BOOTSTRAP/);

    process.env[ALLOW_PREVIEW_BOOTSTRAP_ENV] = "1";
    expect(() => assertPreviewBootstrapAllowed()).toThrow(/ALLOW_PREVIEW_BOOTSTRAP/);

    process.env[ALLOW_PREVIEW_BOOTSTRAP_ENV] = "false";
    expect(() => assertPreviewBootstrapAllowed()).toThrow(/ALLOW_PREVIEW_BOOTSTRAP/);
  });

  it('allows the exact string "true"', () => {
    process.env[ALLOW_PREVIEW_BOOTSTRAP_ENV] = "true";
    expect(() => assertPreviewBootstrapAllowed()).not.toThrow();
  });
});

describe("seedFoundationCatalogs idempotency", () => {
  it("upserts foundation catalogs by natural keys and never writes forbidden tables", async () => {
    const ctx = createCatalogCtx();

    const first = await seedFoundationCatalogs(ctx as never);
    expect(first).toEqual({
      networks: NETWORK_SEEDS.length,
      districts: LIMA_METROPOLITANA_DISTRICTS.length,
      roles: ROLE_SEEDS.length,
      permissions: PERMISSION_SEEDS.length,
      rolePermissions: Object.values(ROLE_PERMISSION_MAP).reduce(
        (sum, codes) => sum + codes.length,
        0,
      ),
    });

    expect(ctx.rows("networks")).toHaveLength(NETWORK_SEEDS.length);
    expect(ctx.rows("districts")).toHaveLength(LIMA_METROPOLITANA_DISTRICTS.length);
    expect(ctx.rows("roles")).toHaveLength(ROLE_SEEDS.length);
    expect(ctx.rows("permissions")).toHaveLength(PERMISSION_SEEDS.length);

    const networkCodes = ctx.rows("networks").map((row) => row.code).sort();
    expect(networkCodes).toEqual([...NETWORK_SEEDS].map((n) => n.code).sort());

    const roleCodes = ctx.rows("roles").map((row) => row.code).sort();
    expect(roleCodes).toEqual([...ROLE_SEEDS].map((r) => r.code).sort());
    expect(roleCodes).toContain("superadmin");

    const second = await seedFoundationCatalogs(ctx as never);
    expect(second).toEqual(first);

    expect(ctx.rows("networks")).toHaveLength(NETWORK_SEEDS.length);
    expect(ctx.rows("districts")).toHaveLength(LIMA_METROPOLITANA_DISTRICTS.length);
    expect(ctx.rows("roles")).toHaveLength(ROLE_SEEDS.length);
    expect(ctx.rows("permissions")).toHaveLength(PERMISSION_SEEDS.length);
    expect(ctx.rows("rolePermissions")).toHaveLength(first.rolePermissions);

    expect(ctx.insertLog.every((table) => FOUNDATION_TABLES.includes(table as never))).toBe(
      true,
    );
    for (const table of FORBIDDEN_TABLES) {
      expect(ctx.rows(table)).toHaveLength(0);
      expect(ctx.insertLog).not.toContain(table);
    }
  });
});
