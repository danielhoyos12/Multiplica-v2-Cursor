import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PasswordGateShell } from "@/components/layout/password-gate-shell";
import {
  authUserRequiresPasswordChange,
  cookieRequiresPasswordChange,
  sessionRequiresPasswordChange,
} from "@/lib/password-change-gate";
import { isPasswordChangeAllowedPath } from "@/lib/safe-redirect";

describe("AuthenticatedLayout must not mutate cookies on render", () => {
  it("layout source has no cookies().set / cookieStore.set", () => {
    const src = readFileSync(
      join(process.cwd(), "src/app/(app)/layout.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/cookieStore\.set\s*\(/);
    expect(src).not.toMatch(/cookies\(\)[\s\S]{0,80}\.set\s*\(/);
    expect(src).not.toMatch(/updateUser\s*\(/);
    expect(src).toContain("PasswordGateShell");
    expect(src).toContain("mustChangePassword");
  });

  it("auth callback sets the gate cookie on redirect response", () => {
    const src = readFileSync(
      join(process.cwd(), "src/app/auth/callback/route.ts"),
      "utf8",
    );
    expect(src).toContain("MUST_CHANGE_PASSWORD_COOKIE");
    expect(src).toMatch(/cookies\.set\s*\(/);
    expect(src).toContain("mustChangePassword: true");
    expect(src).toContain("must_change_password: true");
  });

  it("clearMustChangePasswordAction clears cookie + DB flag", () => {
    const src = readFileSync(
      join(process.cwd(), "src/modules/leadership/password-actions.ts"),
      "utf8",
    );
    expect(src).toContain("mustChangePassword: false");
    expect(src).toContain("MUST_CHANGE_PASSWORD_COOKIE");
    expect(src).toContain("must_change_password: false");
  });
});

describe("password gate shell", () => {
  it("exports PasswordGateShell component", () => {
    expect(typeof PasswordGateShell).toBe("function");
  });
});

describe("password change gate helpers", () => {
  it("reads must_change_password from user_metadata", () => {
    expect(
      authUserRequiresPasswordChange({
        user_metadata: { must_change_password: true },
      }),
    ).toBe(true);
  });

  it("cookie gate", () => {
    expect(cookieRequiresPasswordChange("1")).toBe(true);
    expect(cookieRequiresPasswordChange(undefined)).toBe(false);
  });

  it("combines cookie and metadata", () => {
    expect(
      sessionRequiresPasswordChange({
        user: { user_metadata: { must_change_password: true } },
        cookieValue: undefined,
      }),
    ).toBe(true);
  });
});

describe("protected navigation while gated", () => {
  it("blocks pastoral/admin routes", () => {
    for (const path of [
      "/dashboard",
      "/ganar",
      "/admin/users",
      "/reportes",
    ]) {
      expect(isPasswordChangeAllowedPath(path)).toBe(false);
    }
  });

  it("allows change-password route", () => {
    expect(isPasswordChangeAllowedPath("/cuenta/cambiar-password")).toBe(true);
  });
});
