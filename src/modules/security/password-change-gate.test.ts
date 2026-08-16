import { describe, expect, it } from "vitest";

import {
  authUserRequiresPasswordChange,
  cookieRequiresPasswordChange,
  sessionRequiresPasswordChange,
} from "@/lib/password-change-gate";
import { isPasswordChangeAllowedPath } from "@/lib/safe-redirect";

describe("password change gate", () => {
  it("reads mustChangePassword from Clerk publicMetadata", () => {
    expect(
      authUserRequiresPasswordChange({
        publicMetadata: { mustChangePassword: true },
      }),
    ).toBe(true);
    expect(
      authUserRequiresPasswordChange({
        publicMetadata: { mustChangePassword: false },
      }),
    ).toBe(false);
  });

  it("reads must_change_password from legacy metadata shapes", () => {
    expect(
      authUserRequiresPasswordChange({
        user_metadata: { must_change_password: true },
      }),
    ).toBe(true);
    expect(
      authUserRequiresPasswordChange({
        app_metadata: { must_change_password: true },
      }),
    ).toBe(true);
  });

  it("cookie gate", () => {
    expect(cookieRequiresPasswordChange("1")).toBe(true);
    expect(cookieRequiresPasswordChange("true")).toBe(true);
    expect(cookieRequiresPasswordChange(undefined)).toBe(false);
    expect(cookieRequiresPasswordChange("0")).toBe(false);
  });

  it("combines cookie and metadata", () => {
    expect(
      sessionRequiresPasswordChange({
        user: { publicMetadata: {} },
        cookieValue: "1",
      }),
    ).toBe(true);
    expect(
      sessionRequiresPasswordChange({
        user: { publicMetadata: { mustChangePassword: true } },
        cookieValue: undefined,
      }),
    ).toBe(true);
    expect(
      sessionRequiresPasswordChange({
        user: { publicMetadata: {} },
        cookieValue: undefined,
      }),
    ).toBe(false);
  });
});

describe("password change allowlist — recovery blocklist", () => {
  it("blocks dashboard, ganar, admin, reportes while gated", () => {
    for (const path of [
      "/dashboard",
      "/ganar",
      "/ganar/abc",
      "/admin/users",
      "/reportes",
      "/proceso",
      "/destino",
      "/reencuentro",
      "/escuela-ministerial",
      "/celulas",
      "/liderazgo",
      "/transferencias",
      "/udv",
    ]) {
      expect(isPasswordChangeAllowedPath(path)).toBe(false);
    }
  });

  it("allows change-password and auth endpoints", () => {
    expect(isPasswordChangeAllowedPath("/cuenta/cambiar-password")).toBe(true);
    expect(isPasswordChangeAllowedPath("/auth/callback")).toBe(true);
    expect(isPasswordChangeAllowedPath("/login")).toBe(true);
    expect(isPasswordChangeAllowedPath("/api/health")).toBe(true);
  });
});
