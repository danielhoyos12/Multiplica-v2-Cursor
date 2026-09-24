import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ROLE_PERMISSION_MAP } from "@/db/seeds/data";
import {
  INITIAL_SUPERADMIN_AUDIT_ACTION,
  INITIAL_SUPERADMIN_BOOTSTRAP_ENV,
  INITIAL_SUPERADMIN_DEPLOYMENT_URL,
  assertInitialSuperadminBootstrapAllowed,
  bootstrapInitialSuperadmin,
} from "../../../convex/lib/initialSuperadminBootstrap";

type StoredDoc = Record<string, unknown> & { _id: string };

type EqChain = {
  eq: (field: string, value: unknown) => EqChain;
};

function createBootstrapCtx() {
  const store = new Map<string, Map<string, StoredDoc>>();
  const insertLog: string[] = [];
  let sequence = 0;

  const tableMap = (table: string) => {
    let rows = store.get(table);
    if (!rows) {
      rows = new Map();
      store.set(table, rows);
    }
    return rows;
  };

  const seed = (table: string, id: string, doc: Record<string, unknown>) => {
    tableMap(table).set(id, { ...doc, _id: id });
  };

  const superadminRoleId = "roles:superadmin";
  seed("roles", superadminRoleId, {
    code: "superadmin",
    name: "Superadmin",
    scopeType: "global",
    isSystem: true,
  });
  for (const [index, code] of (ROLE_PERMISSION_MAP.superadmin ?? []).entries()) {
    const permissionId = `permissions:${index}`;
    seed("permissions", permissionId, { code, name: code });
    seed("rolePermissions", `rolePermissions:${index}`, {
      roleId: superadminRoleId,
      permissionId,
    });
  }

  const matchingRows = (
    table: string,
    clauses: ReadonlyArray<readonly [string, unknown]>,
  ) =>
    [...tableMap(table).values()].filter((row) =>
      clauses.every(([field, value]) => row[field] === value),
    );

  const ctx = {
    db: {
      get: async (table: string, id: string) => tableMap(table).get(id) ?? null,
      insert: async (table: string, doc: Record<string, unknown>) => {
        insertLog.push(table);
        const id = `${table}:inserted-${++sequence}`;
        seed(table, id, doc);
        return id;
      },
      query: (table: string) => ({
        take: async (limit: number) => [...tableMap(table).values()].slice(0, limit),
        withIndex: (_name: string, build: (q: EqChain) => EqChain) => {
          const clauses: Array<readonly [string, unknown]> = [];
          const q: EqChain = {
            eq(field: string, value: unknown) {
              clauses.push([field, value]);
              return q;
            },
          };
          build(q);
          return {
            unique: async () => {
              const rows = matchingRows(table, clauses);
              if (rows.length > 1) {
                throw new Error(`Expected unique ${table} row`);
              }
              return rows[0] ?? null;
            },
            collect: async () => matchingRows(table, clauses),
          };
        },
      }),
    },
    rows: (table: string) => [...tableMap(table).values()],
    removeRows: (table: string) => tableMap(table).clear(),
    insertLog,
  };

  return ctx;
}

const validInput = {
  clerkUserId: "user_2abcDEF123",
  email: "admin@example.com",
  displayName: "Initial Admin",
};

describe("initial superadmin bootstrap guard", () => {
  const originalGate = process.env[INITIAL_SUPERADMIN_BOOTSTRAP_ENV];
  const originalCloudUrl = process.env.CONVEX_CLOUD_URL;

  beforeEach(() => {
    process.env[INITIAL_SUPERADMIN_BOOTSTRAP_ENV] = "true";
    process.env.CONVEX_CLOUD_URL = INITIAL_SUPERADMIN_DEPLOYMENT_URL;
  });

  afterEach(() => {
    if (originalGate === undefined) {
      delete process.env[INITIAL_SUPERADMIN_BOOTSTRAP_ENV];
    } else {
      process.env[INITIAL_SUPERADMIN_BOOTSTRAP_ENV] = originalGate;
    }
    if (originalCloudUrl === undefined) {
      delete process.env.CONVEX_CLOUD_URL;
    } else {
      process.env.CONVEX_CLOUD_URL = originalCloudUrl;
    }
  });

  it("fails closed unless the explicit gate and authorized deployment match", () => {
    delete process.env[INITIAL_SUPERADMIN_BOOTSTRAP_ENV];
    expect(() => assertInitialSuperadminBootstrapAllowed()).toThrow(
      /must be exactly 'true'/,
    );

    process.env[INITIAL_SUPERADMIN_BOOTSTRAP_ENV] = "true";
    process.env.CONVEX_CLOUD_URL = "https://another-deployment.convex.cloud";
    expect(() => assertInitialSuperadminBootstrapAllowed()).toThrow(
      /authorized Development deployment/,
    );
  });

  it("creates one user, global assignment, and audit atomically", async () => {
    const ctx = createBootstrapCtx();

    const result = await bootstrapInitialSuperadmin(ctx as never, validInput);

    expect(result.created).toBe(true);
    expect(ctx.rows("users")).toHaveLength(1);
    expect(ctx.rows("userRoleAssignments")).toHaveLength(1);
    expect(ctx.rows("auditLogs")).toHaveLength(1);
    expect(ctx.rows("persons")).toHaveLength(0);
    expect(ctx.rows("userRoleAssignments")[0]).toMatchObject({
      userId: result.userId,
      roleId: "roles:superadmin",
    });
    expect(ctx.rows("userRoleAssignments")[0]).not.toHaveProperty("ministryId");
    expect(ctx.rows("userRoleAssignments")[0]).not.toHaveProperty("networkId");
    expect(ctx.rows("auditLogs")[0]).toMatchObject({
      action: INITIAL_SUPERADMIN_AUDIT_ACTION,
      entityType: "user",
      entityId: result.userId,
    });
  });

  it("is idempotent only for the same consistent identity", async () => {
    const ctx = createBootstrapCtx();

    const first = await bootstrapInitialSuperadmin(ctx as never, validInput);
    const second = await bootstrapInitialSuperadmin(ctx as never, validInput);

    expect(second).toEqual({ ...first, created: false });
    expect(ctx.rows("users")).toHaveLength(1);
    expect(ctx.rows("userRoleAssignments")).toHaveLength(1);
    expect(ctx.rows("auditLogs")).toHaveLength(1);
    expect(ctx.insertLog.filter((table) => table === "users")).toHaveLength(1);
  });

  it("rejects a second identity", async () => {
    const ctx = createBootstrapCtx();
    await bootstrapInitialSuperadmin(ctx as never, validInput);

    await expect(
      bootstrapInitialSuperadmin(ctx as never, {
        clerkUserId: "user_9different",
        email: "other@example.com",
      }),
    ).rejects.toThrow(/incompatible/);
  });

  it("rejects partially inconsistent bootstrap state", async () => {
    const ctx = createBootstrapCtx();
    await bootstrapInitialSuperadmin(ctx as never, validInput);
    ctx.removeRows("auditLogs");

    await expect(bootstrapInitialSuperadmin(ctx as never, validInput)).rejects.toThrow(
      /audit state is inconsistent/,
    );
  });
});
