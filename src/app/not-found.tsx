import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col justify-center gap-3 px-4">
      <h1 className="text-2xl font-semibold">Página no encontrada</h1>
      <p className="text-sm text-[var(--muted)]">
        El recurso no existe o no tienes acceso.
      </p>
      <Link href="/dashboard" className="text-sm underline">
        Volver al inicio
      </Link>
    </div>
  );
}
