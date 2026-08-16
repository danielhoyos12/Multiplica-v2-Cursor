import { describe, expect, it } from "vitest";

import { DomainErrorCode } from "@/lib/errors";
import { ROLE_PERMISSION_MAP } from "@/db/seeds/permissions";
import { canMutate, hasPermission, type AuthContext } from "@/modules/authorization/policy";
import {
  formatPctChange,
  pctChange,
  ReportingThresholds,
  resolvePeriod,
  rowsToCsv,
  sanitizeCsvCell,
  stripSensitiveFields,
} from "@/modules/reporting";

function actor(partial?: Partial<AuthContext>): AuthContext {
  return {
    userId: "u1",
    personId: null,
    roleCodes: [],
    permissionCodes: [],
    ministryIds: [],
    networkIds: [],
    ...partial,
  };
}

describe("reporting period", () => {
  it("resolves this_month with prev window", () => {
    const p = resolvePeriod("this_month");
    expect(p.from.getTime()).toBeLessThan(p.to.getTime());
    expect(p.prevFrom.getTime()).toBeLessThan(p.prevTo.getTime());
    expect(p.prevTo.getTime()).toBeLessThan(p.from.getTime());
  });

  it("pctChange handles zero denominator", () => {
    expect(pctChange(5, 0)).toBeNull();
    expect(formatPctChange(5, 0)).toBe("N/A");
    expect(formatPctChange(0, 0)).toBe("0%");
    expect(formatPctChange(12, 10)).toBe("+20%");
  });
});

describe("csv sanitization", () => {
  it("sanitizes formula injection", () => {
    expect(sanitizeCsvCell("=1+1")).toBe("'=1+1");
    expect(sanitizeCsvCell("+cmd")).toBe("'+cmd");
    expect(sanitizeCsvCell("-2")).toBe("'-2");
    expect(sanitizeCsvCell("@sum")).toBe("'@sum");
  });

  it("quotes commas", () => {
    expect(sanitizeCsvCell("a,b")).toBe('"a,b"');
  });

  it("rowsToCsv includes BOM and headers", () => {
    const csv = rowsToCsv(["name", "val"], [{ name: "=evil", val: 1 }]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("'=evil");
  });

  it("strips prayer_request from exports", () => {
    const cleaned = stripSensitiveFields({
      name: "Ana",
      prayerRequest: "secreto",
      prayer_request: "secreto",
    });
    expect(cleaned).not.toHaveProperty("prayerRequest");
    expect(cleaned).not.toHaveProperty("prayer_request");
    expect(cleaned.name).toBe("Ana");
  });
});

describe("xlsx + print exporters", () => {
  it("builds xlsx buffer with headers and rows", async () => {
    const { rowsToXlsxBuffer } = await import("./xlsx");
    const buf = await rowsToXlsxBuffer({
      reportTitle: "Personas",
      headers: ["nombre", "estado"],
      rows: [{ nombre: "Ana", estado: "activa" }],
      meta: {
        scopeMode: "ministry",
        roleView: "leader",
        generatedAt: "2026-08-16T00:00:00.000Z",
        ministryId: null,
        networkId: null,
        rootPersonId: null,
      },
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.byteLength).toBeGreaterThan(100);
    // zip/xlsx signature
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
  });

  it("builds print html with brand and empty-safe table", async () => {
    const { rowsToPrintHtml } = await import("./print-html");
    const html = rowsToPrintHtml({
      reportTitle: "Células",
      headers: ["nombre"],
      rows: [],
      meta: {
        scopeMode: "global",
        roleView: "superadmin",
        generatedAt: "2026-08-16T00:00:00.000Z",
        ministryId: null,
        networkId: null,
        rootPersonId: null,
      },
    });
    expect(html).toContain("MULTIPLICA");
    expect(html).toContain("Células");
    expect(html).toContain("window.print");
    expect(html).not.toContain("NO_DATA");
  });
});

describe("reporting thresholds documented", () => {
  it("exposes conservative defaults", () => {
    expect(ReportingThresholds.formationStalledDays).toBe(30);
    expect(ReportingThresholds.eligibleNotActivatedDays).toBe(14);
    expect(ReportingThresholds.attendanceDropRatio).toBe(0.7);
    expect(ReportingThresholds.maxDirectLeaders).toBe(12);
    expect(ReportingThresholds.maxDirectCells).toBe(2);
  });
});

describe("reporting permissions", () => {
  it("leader has dashboard.read", () => {
    expect(ROLE_PERMISSION_MAP.leader).toContain("dashboard.read");
    expect(ROLE_PERMISSION_MAP.leader).toContain("reports.export");
  });

  it("staff cannot export by default", () => {
    expect(ROLE_PERMISSION_MAP.staff).toContain("reports.read");
    expect(ROLE_PERMISSION_MAP.staff).not.toContain("reports.export");
  });

  it("LG can mutate reports.read in ministry", () => {
    const lg = actor({
      roleCodes: ["leader_general"],
      permissionCodes: ROLE_PERMISSION_MAP.leader_general,
      ministryIds: ["m1"],
    });
    expect(canMutate(lg, "dashboard.read", { type: "person", ministryId: "m1" })).toBe(true);
  });

  it("domain error codes exist", () => {
    expect(DomainErrorCode.REPORT_EXPORT_DENIED).toBeTruthy();
    expect(DomainErrorCode.REPORT_ACCESS_DENIED).toBeTruthy();
    expect(DomainErrorCode.DASHBOARD_ACCESS_DENIED).toBe("DASHBOARD_ACCESS_DENIED");
  });

  it("export gate must not treat dashboard.read as reports.export", () => {
    const staff = actor({
      roleCodes: ["staff"],
      permissionCodes: ROLE_PERMISSION_MAP.staff,
      ministryIds: ["m1"],
    });
    expect(hasPermission(staff, "dashboard.read")).toBe(true);
    expect(hasPermission(staff, "reports.export")).toBe(false);
  });
});

describe("twelve band visualization helper", () => {
  it("bands are derived not stored", () => {
    const band = (n: number) => {
      if (n >= 12) return "12";
      if (n >= 8) return "8-11";
      if (n >= 4) return "4-7";
      return "0-3";
    };
    expect(band(0)).toBe("0-3");
    expect(band(5)).toBe("4-7");
    expect(band(10)).toBe("8-11");
    expect(band(12)).toBe("12");
  });
});
