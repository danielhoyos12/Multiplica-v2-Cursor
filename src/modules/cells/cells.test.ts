import { describe, expect, it } from "vitest";

import {
  canJoinCellNetwork,
  canManageNetwork,
  canMutate,
  canView,
  type AuthContext,
} from "@/modules/authorization/policy";
import { ROLE_PERMISSION_MAP } from "@/db/seeds/permissions";
import { NETWORK_SEEDS } from "@/db/seeds/data";
import { convertEvangelisticToTwelve } from "@/modules/cells/service";
import {
  createCellInputSchema,
  saveAttendanceInputSchema,
} from "@/modules/cells/validation";
import { formatCellSchedule, formatStartTime } from "@/modules/cells/schedule";

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

describe("cells validation", () => {
  it("accepts a valid cell create payload", () => {
    const parsed = createCellInputSchema.parse({
      name: "Célula Centro",
      type: "evangelistic",
      ministryId: "11111111-1111-4111-8111-111111111111",
      networkId: "22222222-2222-4222-8222-222222222222",
      dayOfWeek: "wednesday",
      startTime: "19:30",
      timezone: "America/Lima",
    });
    expect(parsed.startTime).toBe("19:30:00");
    expect(parsed.type).toBe("evangelistic");
  });

  it("rejects arbitrary cell types", () => {
    expect(() =>
      createCellInputSchema.parse({
        name: "X",
        type: "random",
        ministryId: "11111111-1111-4111-8111-111111111111",
        networkId: "22222222-2222-4222-8222-222222222222",
        dayOfWeek: "monday",
        startTime: "19:00",
      }),
    ).toThrow();
  });

  it("validates attendance batch payload", () => {
    const parsed = saveAttendanceInputSchema.parse({
      sessionDate: "2026-08-14",
      records: [
        {
          personId: "33333333-3333-4333-8333-333333333333",
          status: "present",
        },
      ],
    });
    expect(parsed.records).toHaveLength(1);
  });
});

describe("cell schedule formatting", () => {
  it("formats day and time for UI", () => {
    expect(formatStartTime("19:30:00")).toBe("7:30 PM");
    expect(formatCellSchedule("wednesday", "19:30:00")).toBe("Miércoles · 7:30 PM");
  });
});

describe("network compatibility for cells", () => {
  it("keeps Niños inactive in seeds", () => {
    expect(NETWORK_SEEDS.find((n) => n.code === "ninos")?.isActive).toBe(false);
  });

  it("blocks member join into incompatible networks", () => {
    expect(canJoinCellNetwork("hombres", "hombres")).toBe(true);
    expect(canJoinCellNetwork("mujeres", "hombres")).toBe(false);
    expect(canJoinCellNetwork("jovenes", "jovenes")).toBe(true);
    expect(canJoinCellNetwork("hombres", "jovenes")).toBe(false);
    expect(canJoinCellNetwork("ninos", "hombres")).toBe(false);
  });

  it("keeps responsible manage rules", () => {
    expect(canManageNetwork("hombres", "jovenes")).toBe(true);
    expect(canManageNetwork("jovenes", "hombres")).toBe(false);
  });
});

describe("cells authorization", () => {
  const leader = actor({
    roleCodes: ["leader_general"],
    permissionCodes: ROLE_PERMISSION_MAP.leader_general,
    ministryIds: ["ministry-a"],
  });
  const admin = actor({ roleCodes: ["superadmin"] });

  it("allows superadmin global cell access", () => {
    expect(canView(admin, { type: "cell", ministryId: "ministry-b" })).toBe(true);
    expect(
      canMutate(admin, "cells.create", { type: "cell", ministryId: "ministry-b" }),
    ).toBe(true);
  });

  it("scopes leader_general and denies cross-ministry mutate", () => {
    expect(canView(leader, { type: "cell", ministryId: "ministry-a" })).toBe(true);
    expect(canView(leader, { type: "cell", ministryId: "ministry-b" })).toBe(false);
    expect(
      canMutate(leader, "cells.create", { type: "cell", ministryId: "ministry-b" }),
    ).toBe(false);
    expect(
      canMutate(leader, "cells.attendance", { type: "cell", ministryId: "ministry-a" }),
    ).toBe(true);
  });
});

describe("cell conversion boundary", () => {
  it("exposes conversion entrypoint from cells module", async () => {
    // Full conversion requires DB fixtures; pure readiness rules covered in leadership tests.
    expect(typeof convertEvangelisticToTwelve).toBe("function");
  });
});
