"use client";

import { useSignIn } from "@clerk/nextjs/legacy";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { ErrorState } from "@/components/ui/error-state";

export function ForgotPasswordForm() {
  const router = useRouter();
  const { isLoaded, signIn, setActive } = useSignIn();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"email" | "reset">("email");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSendEmail(event: FormEvent) {
    event.preventDefault();
    if (!isLoaded || !signIn) {
      setError("Clerk aún no está listo.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: email,
      });
      setSent(true);
      setStep("reset");
    } catch {
      // Neutral success to avoid enumeration
      setSent(true);
      setStep("reset");
    } finally {
      setLoading(false);
    }
  }

  async function onReset(event: FormEvent) {
    event.preventDefault();
    if (!isLoaded || !signIn || !setActive) {
      setError("Clerk aún no está listo.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code,
        password,
      });
      if (result.status === "complete" && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        router.replace("/cuenta/cambiar-password");
        router.refresh();
        return;
      }
      setError("No se pudo restablecer la contraseña.");
    } catch {
      setError("Código o contraseña inválidos. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  if (step === "reset") {
    return (
      <form onSubmit={onReset} className="space-y-4">
        {sent ? (
          <p className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
            Si el correo está registrado, recibirás un código. Revisa también spam.
          </p>
        ) : null}
        <label className="block space-y-1 text-sm">
          <span>Código</span>
          <input
            type="text"
            required
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span>Nueva contraseña</span>
          <input
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2"
          />
        </label>
        {error ? <ErrorState title="Recuperación" message={error} /> : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-[var(--radius-sm)] bg-[var(--brand)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {loading ? "Guardando…" : "Restablecer"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={onSendEmail} className="space-y-4">
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
        disabled={loading || !isLoaded}
        className="w-full rounded-[var(--radius-sm)] bg-[var(--brand)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {loading ? "Enviando…" : "Enviar código"}
      </button>
    </form>
  );
}
