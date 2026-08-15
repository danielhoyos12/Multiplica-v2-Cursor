"use client";

import { useState, type FormEvent } from "react";

import { ErrorState } from "@/components/ui/error-state";
import { createClient } from "@/server/supabase/client";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email,
        { redirectTo: `${origin}/auth/callback?next=/cuenta/cambiar-password` },
      );
      // Always show neutral success to avoid enumeration
      if (resetError) {
        console.error("resetPasswordForEmail", resetError.message);
      }
      setSent(true);
    } catch {
      setError("No se pudo enviar la solicitud. Intenta más tarde.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <p className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
        Si el correo está registrado, recibirás instrucciones en breve. Revisa
        también spam.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block space-y-1 text-sm">
        <span>Correo</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2"
        />
      </label>
      {error ? <ErrorState title="Recuperación" message={error} /> : null}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-[var(--radius-sm)] bg-[var(--brand)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {loading ? "Enviando…" : "Enviar enlace"}
      </button>
    </form>
  );
}
