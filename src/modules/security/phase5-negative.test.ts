import { describe, expect, it } from "vitest";

import {
  filterSecondaryGroups,
  SECONDARY_GROUPS,
} from "@/components/layout/nav-config";
import { ROLE_PERMISSION_MAP } from "@/db/seeds/permissions";
import { DomainErrorCode } from "@/lib/errors";
import { safeInternalPath } from "@/lib/safe-redirect";

describe("Phase 5 nav access filter", () => {
  it("hides admin for leader-like access", () => {
    const filtered = filterSecondaryGroups({
      canReadMinistries: false,
      canReadNetworks: true,
      canReadUsers: false,
      canViewSystemHealth: false,
    });
    const admin = filtered.find((g) => g.id === "admin");
    expect(admin?.items.map((i) => i.id)).toEqual(["networks"]);
    expect(filtered.some((g) => g.id === "legacy")).toBe(true);
  });

  it("shows full admin for superadmin-like access", () => {
    const filtered = filterSecondaryGroups({
      canReadMinistries: true,
      canReadNetworks: true,
      canReadUsers: true,
      canViewSystemHealth: true,
    });
    expect(filtered.find((g) => g.id === "admin")?.items).toHaveLength(
      SECONDARY_GROUPS.find((g) => g.id === "admin")!.items.length,
    );
  });

  it("drops empty admin group", () => {
    const filtered = filterSecondaryGroups({
      canReadMinistries: false,
      canReadNetworks: false,
      canReadUsers: false,
      canViewSystemHealth: false,
    });
    expect(filtered.find((g) => g.id === "admin")).toBeUndefined();
  });
});

describe("Phase 5 security negative contracts", () => {
  it("open redirect neutralization", () => {
    expect(safeInternalPath("//evil.example", "/dashboard")).toBe("/dashboard");
    expect(safeInternalPath("https://evil.example", "/dashboard")).toBe("/dashboard");
    expect(safeInternalPath("/ganar", "/dashboard")).toBe("/ganar");
  });

  it("staff cannot export by role map", () => {
    expect(ROLE_PERMISSION_MAP.staff).toContain("reports.read");
    expect(ROLE_PERMISSION_MAP.staff).not.toContain("reports.export");
  });

  it("leader and LG can export; superadmin can export", () => {
    expect(ROLE_PERMISSION_MAP.leader).toContain("reports.export");
    expect(ROLE_PERMISSION_MAP.leader_general).toContain("reports.export");
    expect(ROLE_PERMISSION_MAP.superadmin).toContain("reports.export");
  });

  it("stable denial codes for authz/export", () => {
    expect(DomainErrorCode.REPORT_EXPORT_DENIED).toBe("REPORT_EXPORT_DENIED");
    expect(DomainErrorCode.DASHBOARD_ACCESS_DENIED).toBeTruthy();
  });
});
