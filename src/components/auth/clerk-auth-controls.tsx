"use client";

import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";

/**
 * Clear Clerk auth controls for signed-out / signed-in states.
 * Used on public auth surfaces and the app chrome.
 */
export function ClerkAuthControls({
  appearance = "light",
}: {
  appearance?: "light" | "dark";
}) {
  const muted = appearance === "dark" ? "text-[#F3F0E8]/80" : "text-[var(--muted)]";
  const btn =
    appearance === "dark"
      ? "rounded-[var(--radius-sm)] border border-[#F3F0E8]/25 px-3 py-1.5 text-sm text-[#F3F0E8]"
      : "rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--ink)]";

  return (
    <div className={`flex items-center gap-2 ${muted}`}>
      <Show when="signed-out">
        <SignInButton mode="redirect" forceRedirectUrl="/dashboard">
          <button type="button" className={btn}>
            Ingresar
          </button>
        </SignInButton>
        <SignUpButton mode="redirect" forceRedirectUrl="/dashboard">
          <button type="button" className={btn}>
            Crear cuenta
          </button>
        </SignUpButton>
      </Show>
      <Show when="signed-in">
        <UserButton />
      </Show>
    </div>
  );
}
