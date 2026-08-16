import { describe, expect, it } from "vitest";

import { ROLE_PERMISSION_MAP } from "@/db/seeds/permissions";
import { DomainErrorCode } from "@/lib/errors";
import { rowsToPrintHtml } from "@/modules/reporting/print-html";
import { rowsToCsv, stripSensitiveFields } from "@/modules/reporting/csv";

/** Query helper mirrored by /proceso page */
function resolveEtapa(raw: string | undefined): "pre" | "encuentro" | "post" | null {
  if (raw === "pre" || raw === "encuentro" || raw === "post") return raw;
  return null;
}

describe("Phase 4 proceso deep-link", () => {
  it("accepts only pre|encuentro|post", () => {
    expect(resolveEtapa("pre")).toBe("pre");
    expect(resolveEtapa("encuentro")).toBe("encuentro");
    expect(resolveEtapa("post")).toBe("post");
    expect(resolveEtapa("destino")).toBeNull();
    expect(resolveEtapa("")).toBeNull();
    expect(resolveEtapa(undefined)).toBeNull();
  });
});

describe("Phase 4 export security contracts", () => {
  it("staff has reports.read but not reports.export", () => {
    expect(ROLE_PERMISSION_MAP.staff).toContain("reports.read");
    expect(ROLE_PERMISSION_MAP.staff).not.toContain("reports.export");
  });

  it("leader may export", () => {
    expect(ROLE_PERMISSION_MAP.leader).toContain("reports.export");
  });

  it("export denial code is stable", () => {
    expect(DomainErrorCode.REPORT_EXPORT_DENIED).toBe("REPORT_EXPORT_DENIED");
  });

  it("empty export rows stay human-readable and sanitized", () => {
    const csv = rowsToCsv(["mensaje"], [
      { mensaje: "Sin datos en el alcance actual" },
    ]);
    expect(csv).toContain("Sin datos");
    expect(csv).not.toContain("NO_DATA");
    expect(csv).not.toMatch(/prayer/i);

    const cleaned = stripSensitiveFields({
      nombre: "Ana",
      prayerRequest: "secreto",
    });
    expect(cleaned).not.toHaveProperty("prayerRequest");
  });

  it("print html includes scope meta and no secrets", async () => {
    const html = rowsToPrintHtml({
      reportTitle: "Personas",
      headers: ["nombre"],
      rows: [{ nombre: "Ana" }],
      meta: {
        scopeMode: "ministry",
        roleView: "leader",
        generatedAt: "2026-08-16T00:00:00.000Z",
        ministryId: "m1",
        networkId: null,
        rootPersonId: null,
      },
    });
    expect(html).toContain("MULTIPLICA");
    expect(html).toContain("ministry");
    expect(html).toContain("Ana");
    expect(html).not.toMatch(/service_role|DATABASE_URL|password/i);
  });

  it("xlsx buffer is a zip archive", async () => {
    const { rowsToXlsxBuffer } = await import("@/modules/reporting/xlsx");
    const buf = await rowsToXlsxBuffer({
      reportTitle: "Personas",
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
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
  });
});
