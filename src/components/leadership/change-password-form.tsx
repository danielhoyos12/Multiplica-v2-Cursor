"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { ErrorState } from "@/components/ui/error-state";
import { createClient } from "@/server/supabase/client";
import { clearMustChangePasswordAction } from "@/modules/leadership/password-actions";

export function ChangePasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password.length < 10) {
      setError("La contraseña debe tener al menos 10 caracteres.");
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
        setError(updateError.message);
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
        Debes establecer una contraseña nueva antes de continuar. La temporal no se
        vuelve a mostrar.
      </p>
      <label className="block space-y-1 text-sm">
        <span>Nueva contraseña</span>
        <input
          type="password"
          required
          minLength={10}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2"
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Confirmar</span>
        <input
          type="password"
          required
          minLength={10}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2"
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
