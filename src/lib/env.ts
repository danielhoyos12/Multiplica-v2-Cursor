import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_CONVEX_URL: z.string().url().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().optional(),
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: z.string().optional(),
});

const serverEnvSchema = publicEnvSchema.extend({
  CLERK_SECRET_KEY: z.string().min(1).optional(),
  CONVEX_DEPLOYMENT: z.string().min(1).optional(),
  /** Interim legacy Postgres only — must NOT be a Supabase host. Prefer Convex. */
  DATABASE_URL: z.string().min(1).optional(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function getPublicEnv(): PublicEnv {
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL,
    NEXT_PUBLIC_CLERK_SIGN_UP_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL,
  });

  if (!parsed.success) {
    if (process.env.MULTIPLICA_ALLOW_PLACEHOLDER_ENV === "1") {
      return {
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_placeholder",
        NEXT_PUBLIC_CONVEX_URL: "http://127.0.0.1:3210",
        NEXT_PUBLIC_APP_URL: "http://localhost:3000",
        NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/login",
        NEXT_PUBLIC_CLERK_SIGN_UP_URL: "/login",
      };
    }

    throw new Error(
      `Missing or invalid public environment variables: ${parsed.error.issues
        .map((issue) => issue.path.join("."))
        .join(", ")}`,
    );
  }

  return parsed.data;
}

export function getServerEnv(): ServerEnv {
  const parsed = serverEnvSchema.safeParse({
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL,
    NEXT_PUBLIC_CLERK_SIGN_UP_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    CONVEX_DEPLOYMENT: process.env.CONVEX_DEPLOYMENT,
    DATABASE_URL: process.env.DATABASE_URL,
  });

  if (!parsed.success) {
    throw new Error(
      `Missing or invalid server environment variables: ${parsed.error.issues
        .map((issue) => issue.path.join("."))
        .join(", ")}`,
    );
  }

  return parsed.data;
}

export function hasClerkPublicConfig(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}

export function hasClerkSecret(): boolean {
  return Boolean(process.env.CLERK_SECRET_KEY);
}

export function hasConvexPublicConfig(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
}

/** True when a non-Supabase interim Postgres URL is configured. */
export function hasDatabaseUrl(): boolean {
  const url = process.env.DATABASE_URL;
  if (!url) return false;
  return !isSupabaseDatabaseUrl(url);
}

export function isSupabaseDatabaseUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.includes("supabase.co") || host.includes("supabase.com");
  } catch {
    return /supabase\.(co|com)/i.test(url);
  }
}

export function assertNotSupabaseDatabaseUrl(url: string): void {
  if (isSupabaseDatabaseUrl(url)) {
    throw new Error(
      "Supabase has been removed from MULTIPLICA. Use Convex (NEXT_PUBLIC_CONVEX_URL) as the data plane. " +
        "If you still need interim Postgres, point DATABASE_URL at a non-Supabase host (e.g. Neon).",
    );
  }
}
