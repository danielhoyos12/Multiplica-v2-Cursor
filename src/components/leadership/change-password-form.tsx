"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { ErrorState } from "@/components/ui/error-state";
import { createClient } from "@/server/supabase/client";
import { clearMustChangePasswordAction } from "@/modules/leadership/password-actions";

function passwordPolicyError(password: string): string | null {
  if (password.length < 10) {
    return "La contraseña debe tener al menos 10 caracteres.";
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "Incluye al menos una letra y un número.";
  }
  const lower = password.toLowerCase();
  if (
    lower.includes("multiplica") ||
    lower.includes("temporal") ||
    lower === "password" ||
    lower === "1234567890"
  ) {
    return "Elige una contraseña distinta a valores temporales obvios.";
  }
  return null;
}

export function ChangePasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const policy = passwordPolicyError(password);
    if (policy) {
      setError(policy);
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError("No se pudo actualizar la contraseña. Intenta de nuevo o contacta soporte.");
        setLoading(false);
        return;
      }
      const cleared = await clearMustChangePasswordAction();
      if (!cleared.ok) {
        setError(cleared.error);
        setLoading(false);
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("No se pudo actualizar la contraseña.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-md space-y-4">
      <p className="text-sm text-[var(--muted)]">
        Debes establecer una contraseña nueva antes de continuar (mín. 10 caracteres,
        letra y número). La temporal no se vuelve a mostrar.
      </p>
      <label className="block space-y-1 text-sm">
        <span>Nueva contraseña</span>
        <input
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-base"
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Confirmar</span>
        <input
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-base"
        />
      </label>
      {error ? <ErrorState title="Cambio de contraseña" message={error} /> : null}
      <button
        type="submit"
        disabled={loading}
        className="rounded-[var(--radius-sm)] bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {loading ? "Guardando…" : "Guardar contraseña"}
      </button>
    </form>
  );
}
