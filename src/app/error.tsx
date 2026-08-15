"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("route error", error.digest ?? error.name);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg space-y-3 py-12">
      <h1 className="text-xl font-semibold text-[var(--ink)]">Error</h1>
      <p className="text-sm text-[var(--muted)]">
        Ocurrió un problema al cargar esta página.
        {error.digest ? (
          <span className="mt-1 block font-mono text-xs">Ref: {error.digest}</span>
        ) : null}
      </p>
      <div className="flex gap-3 text-sm">
        <button type="button" onClick={reset} className="underline">
          Reintentar
        </button>
        <Link href="/dashboard" className="underline">
          Dashboard
        </Link>
      </div>
    </div>
  );
}
