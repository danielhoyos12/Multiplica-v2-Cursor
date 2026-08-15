"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("app error", error.digest ?? error.name);
  }, [error]);

  return (
    <html lang="es">
      <body className="mx-auto max-w-lg p-8 font-sans">
        <h1 className="text-xl font-semibold">Algo salió mal</h1>
        <p className="mt-2 text-sm text-neutral-600">
          No se pudo completar la operación. Intenta de nuevo.
          {error.digest ? (
            <span className="mt-2 block font-mono text-xs">Ref: {error.digest}</span>
          ) : null}
        </p>
        <div className="mt-4 flex gap-3 text-sm">
          <button type="button" onClick={reset} className="underline">
            Reintentar
          </button>
          <Link href="/dashboard" className="underline">
            Ir al inicio
          </Link>
        </div>
      </body>
    </html>
  );
}
