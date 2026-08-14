import { PublicGanarForm } from "@/components/ganar/public-form";
import {
  listCatalogsForGanar,
  resolvePublicFormContext,
} from "@/modules/ganar";

export const metadata = {
  title: "Registro GANAR",
  description: "Formulario público para registrar personas ganadas.",
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function PublicGanarRegistroPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const context = await resolvePublicFormContext({
    ministry: one(sp.ministry),
    network: one(sp.network),
  });

  const catalogs = await listCatalogsForGanar(null, {
    publicMode: true,
    ministryId: context.ministryId ?? undefined,
    networkId: context.networkId ?? undefined,
  });

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#dcebE5,_var(--page-bg)_45%)] px-4 py-10 sm:px-6">
      <div className="mx-auto flex max-w-lg flex-col gap-8">
        <header className="space-y-3 text-center">
          <p className="font-[family-name:var(--font-display)] text-2xl tracking-tight text-[var(--brand-ink)]">
            MULTIPLICA
          </p>
          <p className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
            Visión G12
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight text-[var(--ink)] sm:text-4xl">
            Registro GANAR
          </h1>
          <p className="text-sm text-[var(--muted)] sm:text-base">
            Completa los datos y envía. No requiere iniciar sesión.
          </p>
        </header>

        {catalogs.ministries.length === 0 ? (
          <p className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 text-center text-sm text-[var(--muted)]">
            El formulario no está disponible en este momento.
          </p>
        ) : (
          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow)] sm:p-6">
            <PublicGanarForm
              districts={catalogs.districts}
              ministries={catalogs.ministries}
              networks={catalogs.networks}
              defaultMinistryId={context.ministryId}
              defaultNetworkId={context.networkId}
              lockMinistry={Boolean(context.ministryId)}
              lockNetwork={Boolean(context.networkId)}
            />
          </div>
        )}
      </div>
    </main>
  );
}
