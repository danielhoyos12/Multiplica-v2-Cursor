import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().optional(),
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: z.string().optional(),
});

const serverEnvSchema = publicEnvSchema.extend({
  CLERK_SECRET_KEY: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1).optional(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function getPublicEnv(): PublicEnv {
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL,
    NEXT_PUBLIC_CLERK_SIGN_UP_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL,
  });

  if (!parsed.success) {
    // Allow `next build` in CI/agents before secrets are injected.
    if (process.env.MULTIPLICA_ALLOW_PLACEHOLDER_ENV === "1") {
      return {
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_placeholder",
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
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL,
    NEXT_PUBLIC_CLERK_SIGN_UP_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
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

export function hasDatabaseUrl(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function hasClerkPublicConfig(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}

export function hasClerkSecret(): boolean {
  return Boolean(process.env.CLERK_SECRET_KEY);
}

/** @deprecated Use hasClerkPublicConfig — kept as alias during cutover. */
export function hasSupabasePublicConfig(): boolean {
  return hasClerkPublicConfig();
}
