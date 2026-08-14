import { describe, expect, it } from "vitest";

import {
  canManageNetwork,
  canMutate,
  canView,
  hasPermission,
  isSuperadmin,
  type AuthContext,
} from "@/modules/authorization/policy";
import { DomainError, DomainErrorCode } from "@/lib/errors";
import { sanitizeAuditPayload } from "@/modules/audit/logger";
import {
  LIMA_METROPOLITANA_DISTRICTS,
  NETWORK_SEEDS,
  ROLE_SEEDS,
} from "@/db/seeds/data";
import { hasDatabaseUrl, hasSupabasePublicConfig } from "@/lib/env";

function actor(partial?: Partial<AuthContext>): AuthContext {
  return {
    userId: "user-1",
    roleCodes: [],
    permissionCodes: [],
    ministryIds: [],
    networkIds: [],
    ...partial,
  };
}

describe("authorization foundation", () => {
  it("grants superadmin all permissions", () => {
    const admin = actor({ roleCodes: ["superadmin"] });
    expect(isSuperadmin(admin)).toBe(true);
    expect(hasPermission(admin, "platform.configure")).toBe(true);
    expect(canView(admin, "person-xyz")).toBe(true);
  });

  it("denies upward/lateral visibility by default", () => {
    const leader = actor({
      roleCodes: ["leader"],
      permissionCodes: ["persons.read"],
    });
    expect(canView(leader, "other-person")).toBe(false);
    expect(canView(leader, "self-person", { actorPersonId: "self-person" })).toBe(true);
  });

  it("requires permission for mutate actions", () => {
    const leader = actor({
      roleCodes: ["leader"],
      permissionCodes: ["persons.read"],
    });
    expect(canMutate(leader, "persons.write")).toBe(false);
    expect(
      canMutate(actor({ permissionCodes: ["persons.write"] }), "persons.write"),
    ).toBe(true);
  });

  it("enforces network management compatibility", () => {
    expect(canManageNetwork("hombres", "hombres")).toBe(true);
    expect(canManageNetwork("hombres", "jovenes")).toBe(true);
    expect(canManageNetwork("hombres", "mujeres")).toBe(false);
    expect(canManageNetwork("mujeres", "mujeres")).toBe(true);
    expect(canManageNetwork("mujeres", "jovenes")).toBe(true);
    expect(canManageNetwork("jovenes", "hombres")).toBe(false);
    expect(canManageNetwork("jovenes", "jovenes")).toBe(true);
    expect(canManageNetwork("ninos", "ninos")).toBe(false);
  });
});

describe("audit sanitization", () => {
  it("redacts secrets from audit payloads", () => {
    const sanitized = sanitizeAuditPayload({
      email: "a@b.com",
      password: "secret",
      nested: { access_token: "abc", ok: true },
    });

    expect(sanitized).toEqual({
      email: "a@b.com",
      password: "[REDACTED]",
      nested: { access_token: "[REDACTED]", ok: true },
    });
  });
});

describe("domain errors", () => {
  it("exposes stable codes", () => {
    const error = new DomainError(
      DomainErrorCode.NOT_AUTHORIZED,
      "denied",
    );
    expect(error.code).toBe("NOT_AUTHORIZED");
  });
});

describe("seed catalogs", () => {
  it("includes four network types with Niños inactive", () => {
    expect(NETWORK_SEEDS).toHaveLength(4);
    const ninos = NETWORK_SEEDS.find((network) => network.code === "ninos");
    expect(ninos?.isActive).toBe(false);
    expect(ninos?.isConfigurable).toBe(true);
  });

  it("seeds Lima Metropolitana districts", () => {
    expect(LIMA_METROPOLITANA_DISTRICTS.length).toBeGreaterThan(40);
    expect(LIMA_METROPOLITANA_DISTRICTS).toContain("Miraflores");
    expect(LIMA_METROPOLITANA_DISTRICTS).toContain("Callao");
  });

  it("includes foundation roles without inventing ministries", () => {
    expect(ROLE_SEEDS.map((role) => role.code)).toContain("superadmin");
  });
});

describe("environment helpers", () => {
  it("reports missing database/supabase config without throwing", () => {
    expect(typeof hasDatabaseUrl()).toBe("boolean");
    expect(typeof hasSupabasePublicConfig()).toBe("boolean");
  });
});
