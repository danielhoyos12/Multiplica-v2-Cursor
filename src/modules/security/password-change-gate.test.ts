import { describe, expect, it } from "vitest";

import {
  authUserRequiresPasswordChange,
  cookieRequiresPasswordChange,
  sessionRequiresPasswordChange,
} from "@/lib/password-change-gate";
import { isPasswordChangeAllowedPath } from "@/lib/safe-redirect";

describe("password change gate", () => {
  it("reads must_change_password from user_metadata", () => {
    expect(
      authUserRequiresPasswordChange({
        user_metadata: { must_change_password: true },
      }),
    ).toBe(true);
    expect(
      authUserRequiresPasswordChange({
        user_metadata: { must_change_password: false },
      }),
    ).toBe(false);
  });

  it("reads must_change_password from app_metadata", () => {
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
        user: { user_metadata: {} },
        cookieValue: "1",
      }),
    ).toBe(true);
    expect(
      sessionRequiresPasswordChange({
        user: { user_metadata: { must_change_password: true } },
        cookieValue: undefined,
      }),
    ).toBe(true);
    expect(
      sessionRequiresPasswordChange({
        user: { user_metadata: {} },
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
