import { describe, expect, it } from "vitest";

import {
  formatFullName,
  namesLookSimilar,
  normalizePhone,
  phonesMatchStrong,
  splitFullName,
} from "@/modules/ganar/normalize";
import {
  assertNetworkAllowedForCapture,
  ganarPersonInputSchema,
  publicGanarInputSchema,
} from "@/modules/ganar/validation";
import { DomainError } from "@/lib/errors";
import { sanitizeAuditPayload } from "@/modules/audit/logger";
import {
  canAccessMinistry,
  canMutate,
  canView,
  isSuperadmin,
  type AuthContext,
} from "@/modules/authorization/policy";
import { ROLE_PERMISSION_MAP } from "@/db/seeds/permissions";
import { NETWORK_SEEDS } from "@/db/seeds/data";

function actor(partial?: Partial<AuthContext>): AuthContext {
  return {
    userId: "user-1",
    personId: null,
    roleCodes: [],
    permissionCodes: [],
    ministryIds: [],
    networkIds: [],
    ...partial,
  };
}

describe("GANAR normalize", () => {
  it("normalizes phone to digits", () => {
    expect(normalizePhone("+51 987 654 321")).toBe("51987654321");
    expect(normalizePhone("(01) 234-5678")).toBe("012345678");
    expect(normalizePhone("")).toBeNull();
  });

  it("detects strong phone matches across country prefix", () => {
    expect(phonesMatchStrong("+51 987654321", "987654321")).toBe(true);
    expect(phonesMatchStrong("111111111", "222222222")).toBe(false);
  });

  it("splits and formats full name", () => {
    expect(splitFullName("Ana María Pérez")).toEqual({
      firstName: "Ana",
      lastName: "María Pérez",
    });
    expect(splitFullName("Juan")).toEqual({ firstName: "Juan", lastName: "." });
    expect(formatFullName("Juan", ".")).toBe("Juan");
    expect(formatFullName("Ana", "Pérez")).toBe("Ana Pérez");
  });

  it("detects similar names for possible duplicates", () => {
    expect(namesLookSimilar("Ana", "Perez", "Ana", "Pérez")).toBe(true);
    expect(namesLookSimilar("Ana", "Perez", "Luis", "Gomez")).toBe(false);
  });
});

describe("GANAR validation", () => {
  const valid = {
    fullName: "María López García",
    phone: "987654321",
    address: "Av. Ejemplo 123",
    districtId: "11111111-1111-4111-8111-111111111111",
    prayerRequest: "Por salud",
    ministryId: "22222222-2222-4222-8222-222222222222",
    networkId: "33333333-3333-4333-8333-333333333333",
  };

  it("accepts valid internal payload", () => {
    expect(ganarPersonInputSchema.parse(valid).fullName).toBe("María López García");
  });

  it("rejects short phone / missing district on public form", () => {
    expect(() =>
      publicGanarInputSchema.parse({ ...valid, phone: "123" }),
    ).toThrow();
    expect(() =>
      publicGanarInputSchema.parse({ ...valid, districtId: "" }),
    ).toThrow();
  });

  it("rejects unexpected public fields silently via omit (forceCreate not allowed)", () => {
    const parsed = publicGanarInputSchema.parse({
      ...valid,
      forceCreate: true,
    } as never);
    expect("forceCreate" in parsed).toBe(false);
  });

  it("blocks Niños / inactive networks for capture", () => {
    expect(() =>
      assertNetworkAllowedForCapture({ networkCode: "ninos", networkIsActive: false }),
    ).toThrow(DomainError);
    expect(() =>
      assertNetworkAllowedForCapture({ networkCode: "hombres", networkIsActive: false }),
    ).toThrow(DomainError);
    expect(() =>
      assertNetworkAllowedForCapture({ networkCode: "hombres", networkIsActive: true }),
    ).not.toThrow();
  });

  it("keeps Niños inactive in seed catalog", () => {
    const ninos = NETWORK_SEEDS.find((n) => n.code === "ninos");
    expect(ninos?.isActive).toBe(false);
  });
});

describe("GANAR authorization scope", () => {
  const leader = actor({
    roleCodes: ["leader_general"],
    permissionCodes: ROLE_PERMISSION_MAP.leader_general,
    ministryIds: ["ministry-a"],
  });
  const admin = actor({ roleCodes: ["superadmin"] });

  it("grants superadmin global person view", () => {
    expect(isSuperadmin(admin)).toBe(true);
    expect(canView(admin, { type: "person", id: "p1", ministryId: "ministry-b" })).toBe(
      true,
    );
    expect(canMutate(admin, "persons.write", { type: "person", ministryId: "x" })).toBe(
      true,
    );
  });

  it("scopes leader_general to own ministry", () => {
    expect(canAccessMinistry(leader, "ministry-a")).toBe(true);
    expect(canView(leader, { type: "person", ministryId: "ministry-a" })).toBe(true);
    expect(canView(leader, { type: "person", ministryId: "ministry-b" })).toBe(false);
    expect(
      canMutate(leader, "persons.write", {
        type: "person",
        ministryId: "ministry-b",
      }),
    ).toBe(false);
  });

  it("blocks cross-ministry edit via canMutate", () => {
    expect(
      canMutate(leader, "persons.write", {
        type: "person",
        id: "p-other",
        ministryId: "ministry-other",
      }),
    ).toBe(false);
  });
});

describe("prayer request privacy in audit", () => {
  it("redacts prayer_request keys from audit payloads", () => {
    const sanitized = sanitizeAuditPayload({
      firstName: "Ana",
      prayer_request: "contenido sensible",
      prayerRequest: "también sensible",
      hasPrayerRequest: true,
      nested: { peticion: "no debe verse" },
    });
    expect(sanitized?.prayer_request).toBe("[REDACTED]");
    expect(sanitized?.prayerRequest).toBe("[REDACTED]");
    expect(sanitized?.hasPrayerRequest).toBe(true);
    expect((sanitized?.nested as Record<string, unknown>).peticion).toBe("[REDACTED]");
    expect(JSON.stringify(sanitized)).not.toContain("contenido sensible");
    expect(JSON.stringify(sanitized)).not.toContain("también sensible");
  });
});

describe("duplicate strength helpers", () => {
  it("classifies strong vs possible", () => {
    const strong = phonesMatchStrong("987654321", "51987654321");
    const possible =
      !strong && namesLookSimilar("Carlos", "Ruiz", "Carlos", "Ruiz Lopez");
    expect(strong).toBe(true);
    expect(possible).toBe(false);

    const soft =
      !phonesMatchStrong("111", "222") &&
      namesLookSimilar("Carlos", "Ruiz", "Carlos", "Ruiz");
    expect(soft).toBe(true);
  });
});
