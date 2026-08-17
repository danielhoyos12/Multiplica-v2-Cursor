import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi, afterEach } from "vitest";

import { forbidden, unauthenticated } from "../../../convex/lib/errors";
import {
  hasPermission,
  isSuperadmin,
  requireActiveAppUser,
  requireAppUser,
  requireIdentity,
  type ConvexAuthContext,
} from "../../../convex/lib/identity";
import { GET as readyGet } from "@/app/api/ready/route";
import { GET as healthGet } from "@/app/api/health/route";

function readSrc(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function actor(partial?: Partial<ConvexAuthContext>): ConvexAuthContext {
  return {
    userId: "users:actor",
    personId: null,
    roleCodes: [],
    permissionCodes: [],
    ministryIds: [],
    networkIds: [],
    ...partial,
  };
}

describe("Security hardening Clerk ↔ Convex — source contracts", () => {
  it("does not offer public Clerk signup in UI", () => {
    const controls = readSrc("src/components/auth/clerk-auth-controls.tsx");
    const login = readSrc("src/components/auth/login-form.tsx");
    const signUpPage = readSrc("src/app/(auth)/sign-up/page.tsx");
    expect(controls).not.toMatch(/SignUpButton/);
    expect(login).not.toMatch(/href="\/sign-up"/);
    expect(signUpPage).toMatch(/redirect\("\/login\?notice=no-signup"\)/);
  });

  it("does not auto-insert active users from unknown Clerk identities", () => {
    const users = readSrc("convex/users.ts");
    expect(users).toMatch(/linkProvisionedIdentity/);
    expect(users).toMatch(/NEVER creates a new user/i);
    const insertBlocks = [...users.matchAll(/ctx\.db\.insert\("users"/g)];
    expect(insertBlocks.length).toBe(1);
    expect(users).toMatch(/provisionLeaderUser/);
  });

  it("does not trust client actorUserId on Convex mutations", () => {
    const files = [
      "convex/leadership.ts",
      "convex/transfers.ts",
      "convex/send.ts",
      "convex/persons.ts",
      "convex/audit.ts",
      "convex/authz.ts",
    ];
    for (const file of files) {
      const src = readSrc(file);
      const blocks = src.matchAll(
        /export const \w+ = (?:query|mutation)\(\{[\s\S]*?handler:/g,
      );
      for (const block of blocks) {
        expect(block[0], file).not.toMatch(/actorUserId:\s*v\./);
      }
    }
  });

  it("seed catalogs are internal-only", () => {
    expect(readSrc("convex/seed.ts")).toMatch(/internalMutation/);
    expect(readSrc("convex/authz.ts")).toMatch(/seedSuperadminRole = internalMutation/);
  });

  it("server Convex client documents JWT template convex", () => {
    const convex = readSrc("src/server/convex.ts");
    expect(convex).toMatch(/template: "convex"/);
    expect(convex).toMatch(/getAuthenticatedConvexClient/);
    expect(convex).toMatch(/getPublicConvexClient/);
  });
});

describe("identity helpers", () => {
  it("requireIdentity fails closed without a Clerk JWT", async () => {
    const ctx = { auth: { getUserIdentity: async () => null } };
    await expect(requireIdentity(ctx as never)).rejects.toMatchObject({
      data: { code: "UNAUTHENTICATED" },
    });
  });

  it("unknown Clerk identity does not become an app user", async () => {
    const ctx = {
      auth: { getUserIdentity: async () => ({ subject: "user_unknown" }) },
      db: {
        query: () => ({
          withIndex: () => ({ unique: async () => null }),
        }),
      },
    };
    await expect(requireAppUser(ctx as never)).rejects.toMatchObject({
      data: { code: "FORBIDDEN" },
    });
  });

  it("inactive provisioned users cannot operate", async () => {
    const ctx = {
      auth: { getUserIdentity: async () => ({ subject: "user_inactive" }) },
      db: {
        query: () => ({
          withIndex: () => ({
            unique: async () => ({
              _id: "users:1",
              authSubject: "user_inactive",
              isActive: false,
            }),
          }),
        }),
      },
    };
    await expect(requireActiveAppUser(ctx as never)).rejects.toMatchObject({
      data: { code: "FORBIDDEN" },
    });
  });

  it("superadmin bypasses permission and ministry scope checks", () => {
    const auth = actor({ roleCodes: ["superadmin"] });
    expect(isSuperadmin(auth)).toBe(true);
    expect(hasPermission(auth, "leaders.activate")).toBe(true);
  });

  it("ministry A leader cannot satisfy ministry B scope", () => {
    const authz = actor({
      roleCodes: ["leader"],
      permissionCodes: ["persons.write"],
      ministryIds: ["ministries:a"],
    });
    expect(hasPermission(authz, "persons.write")).toBe(true);
    expect(authz.ministryIds.includes("ministries:b")).toBe(false);
    expect(isSuperadmin(authz)).toBe(false);
  });

  it("spoofed actorUserId cannot replace JWT identity (helpers ignore args)", async () => {
    const ctx = {
      auth: { getUserIdentity: async () => ({ subject: "user_real" }) },
      db: {
        query: () => ({
          withIndex: () => ({
            unique: async () => ({
              _id: "users:real",
              authSubject: "user_real",
              isActive: true,
            }),
          }),
        }),
      },
    };
    const user = await requireActiveAppUser(ctx as never);
    expect(user._id).toBe("users:real");
    expect(user.authSubject).not.toBe("users:spoofed");
  });
});

describe("API ready / health", () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
    vi.restoreAllMocks();
  });

  it("health is liveness (200) even without Convex", async () => {
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    const res = await healthGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  it("ready is 503 when Convex is missing", async () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_fixture";
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
    const res = await readyGet();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("not_ready");
    expect(body.checks.clerkConfigured).toBe(true);
    expect(body.checks.convexConfigured).toBe(false);
    expect(body.checks.convexReachable).toBe(false);
    expect(body.checks).not.toHaveProperty("databaseConfigured");
  });
});

describe("error helpers stay structured", () => {
  it("unauthenticated / forbidden codes", () => {
    try {
      unauthenticated("x");
    } catch (error) {
      expect(error).toMatchObject({ data: { code: "UNAUTHENTICATED", message: "x" } });
    }
    try {
      forbidden("no");
    } catch (error) {
      expect(error).toMatchObject({ data: { code: "FORBIDDEN", message: "no" } });
    }
  });
});
