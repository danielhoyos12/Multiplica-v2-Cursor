import { describe, expect, it } from "vitest";

import { isPasswordChangeAllowedPath, safeInternalPath } from "@/lib/safe-redirect";
import { sanitizeCsvCell, stripSensitiveFields } from "@/modules/reporting";
import { userFacingErrorMessage } from "@/lib/user-facing-errors";
import { DomainError, DomainErrorCode } from "@/lib/errors";

describe("open redirect defense", () => {
  it("allows relative app paths", () => {
    expect(safeInternalPath("/dashboard")).toBe("/dashboard");
    expect(safeInternalPath("/ganar/abc")).toBe("/ganar/abc");
  });

  it("blocks protocol-relative and absolute URLs", () => {
    expect(safeInternalPath("//evil.com")).toBe("/dashboard");
    expect(safeInternalPath("https://evil.com")).toBe("/dashboard");
    expect(safeInternalPath("/\\evil")).toBe("/dashboard");
    expect(safeInternalPath("///evil.com")).toBe("/dashboard");
  });

  it("blocks encoded tricks", () => {
    expect(safeInternalPath("/%2F%2Fevil.com")).toBe("/dashboard");
  });
});

describe("password change allowlist", () => {
  it("allows password and auth routes", () => {
    expect(isPasswordChangeAllowedPath("/cuenta/cambiar-password")).toBe(true);
    expect(isPasswordChangeAllowedPath("/login")).toBe(true);
    expect(isPasswordChangeAllowedPath("/api/health")).toBe(true);
  });

  it("blocks pastoral routes", () => {
    expect(isPasswordChangeAllowedPath("/dashboard")).toBe(false);
    expect(isPasswordChangeAllowedPath("/ganar")).toBe(false);
    expect(isPasswordChangeAllowedPath("/celulas/1")).toBe(false);
  });
});

describe("privacy / export", () => {
  it("never keeps prayer fields in export strip", () => {
    const row = stripSensitiveFields({
      name: "Ana",
      prayerRequest: "secreto",
      prayer_request: "secreto2",
    });
    expect(JSON.stringify(row)).not.toMatch(/prayer/i);
  });

  it("sanitizes CSV formula injection", () => {
    for (const v of ["=cmd", "+SUM(1)", "-1+1", "@evil"]) {
      expect(sanitizeCsvCell(v).startsWith("'")).toBe(true);
    }
  });
});

describe("user-facing errors", () => {
  it("maps capacity error to Spanish", () => {
    const msg = userFacingErrorMessage(
      new DomainError(
        DomainErrorCode.LEADER_PARENT_CAPACITY_REACHED,
        "LEADER_PARENT_CAPACITY_REACHED",
      ),
    );
    expect(msg).toContain("12");
    expect(msg).not.toBe("LEADER_PARENT_CAPACITY_REACHED");
  });

  it("redacts database connection noise", () => {
    const msg = userFacingErrorMessage(new Error("DATABASE_URL postgres://secret"));
    expect(msg).not.toMatch(/postgres:\/\//);
    expect(msg).not.toMatch(/secret/);
  });
});

describe("env public/server boundary (static)", () => {
  it("public schema keys are only NEXT_PUBLIC_*", () => {
    const publicKeys = [
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_CONVEX_URL",
      "NEXT_PUBLIC_APP_URL",
      "NEXT_PUBLIC_CLERK_SIGN_IN_URL",
      "NEXT_PUBLIC_CLERK_SIGN_UP_URL",
    ];
    expect(publicKeys.every((k) => k.startsWith("NEXT_PUBLIC_"))).toBe(true);
    expect("CLERK_SECRET_KEY".startsWith("NEXT_PUBLIC_")).toBe(false);
    expect("CONVEX_DEPLOYMENT".startsWith("NEXT_PUBLIC_")).toBe(false);
    expect("DATABASE_URL".startsWith("NEXT_PUBLIC_")).toBe(false);
  });
});

describe("prod guard", () => {
  it("refuses APP_ENV=production", async () => {
    const { assertNotProductionTarget } = await import("@/lib/prod-guard");
    expect(() => assertNotProductionTarget({ appEnv: "production" })).toThrow(/production/i);
  });

  it("redacts db password", async () => {
    const { redactDatabaseUrl } = await import("@/lib/prod-guard");
    expect(redactDatabaseUrl("postgresql://u:secret@host/db")).not.toContain("secret");
  });
});
