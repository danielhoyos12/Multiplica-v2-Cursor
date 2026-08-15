"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { createClient } from "@/server/supabase/client";
import { ErrorState } from "@/components/ui/error-state";
import { safeInternalPath } from "@/lib/safe-redirect";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeInternalPath(searchParams.get("next"), "/dashboard");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError("No se pudo iniciar sesión. Verifica tus credenciales.");
        setLoading(false);
        return;
      }

      router.replace(nextPath);
      router.refresh();
    } catch {
      setError(
        "La autenticación no está configurada o no se pudo conectar con Supabase.",
      );
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="email" className="block text-sm font-medium text-[var(--ink)]">
          Correo
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] outline-none ring-[var(--brand)] focus:ring-2"
        />
      </div>
      <div className="space-y-2">
        <label
          htmlFor="password"
          className="block text-sm font-medium text-[var(--ink)]"
        >
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] outline-none ring-[var(--brand)] focus:ring-2"
        />
      </div>
      {error ? <ErrorState message={error} title="Inicio de sesión" /> : null}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-[var(--radius-sm)] bg-[var(--brand)] px-4 py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-60"
      >
        {loading ? "Ingresando…" : "Ingresar"}
      </button>
      <p className="text-center text-sm">
        <Link href="/recuperar" className="underline">
          ¿Olvidaste tu contraseña?
        </Link>
      </p>
    </form>
  );
}
