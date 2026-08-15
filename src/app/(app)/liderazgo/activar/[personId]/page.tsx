import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ActivateLeaderForm } from "@/components/leadership/activate-form";
import { PageHeader } from "@/components/ui/page-header";
import { hasPermission, isSuperadmin } from "@/modules/authorization";
import { getPersonForActor } from "@/modules/ganar";
import { DomainError, DomainErrorCode } from "@/lib/errors";
import { requireAppActor } from "@/server/actor";
import { markEligibleAction } from "@/modules/leadership/actions";

export const metadata = { title: "Activar líder" };

type Params = Promise<{ personId: string }>;

export default async function ActivarLiderPage({ params }: { params: Params }) {
  const { personId } = await params;
  const { session, auth } = await requireAppActor();
  if (!hasPermission(auth, "leaders.activate")) {
    redirect(`/ganar/${personId}`);
  }

  let detail;
  try {
    detail = await getPersonForActor(session.id, personId);
  } catch (error) {
    if (error instanceof DomainError && error.code === DomainErrorCode.NOT_FOUND) {
      notFound();
    }
    throw error;
  }

  const ministryId = detail.current?.ministryId;
  const networkId = detail.current?.networkId;

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <PageHeader
        title={`Activar · ${detail.person.fullName}`}
        description="Eligible ≠ activo. La activación abre célula evangelística de forma atómica."
        actions={
          <Link href={`/ganar/${personId}`} className="text-sm underline">
            Volver a persona
          </Link>
        }
      />

      {ministryId && networkId ? (
        <form
          action={async () => {
            "use server";
            await markEligibleAction({ personId, ministryId, networkId });
          }}
        >
          <button
            type="submit"
            className="rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-2 text-sm"
          >
            Marcar como apto / ungido
          </button>
        </form>
      ) : (
        <p className="text-sm text-[var(--muted)]">
          La persona necesita pertenencia organizacional (Ministerio + Red) en GANAR.
        </p>
      )}

      <ActivateLeaderForm
        personId={personId}
        defaultDirectLeaderPersonId={auth.personId}
        allowRoot={isSuperadmin(auth) || hasPermission(auth, "leaders.manage_tree")}
      />
    </div>
  );
}
