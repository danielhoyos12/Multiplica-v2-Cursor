import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { DomainError, DomainErrorCode } from "@/lib/errors";
import { hasPermission } from "@/modules/authorization";
import { getBreadcrumbs, getLeaderDashboard } from "@/modules/leadership";
import { requireAppActor } from "@/server/actor";

export const metadata = { title: "Líder" };

type Params = Promise<{ personId: string }>;

export default async function LeaderFocusPage({ params }: { params: Params }) {
  const { personId } = await params;
  const { session, auth } = await requireAppActor();
  if (!hasPermission(auth, "leaders.view_descendants") && !hasPermission(auth, "leaders.read")) {
    redirect("/dashboard");
  }

  let dashboard;
  try {
    dashboard = await getLeaderDashboard(session.id, personId);
  } catch (error) {
    if (
      error instanceof DomainError &&
      (error.code === DomainErrorCode.TREE_ACCESS_DENIED ||
        error.code === DomainErrorCode.NOT_FOUND ||
        error.code === DomainErrorCode.NOT_AUTHORIZED)
    ) {
      notFound();
    }
    throw error;
  }

  const crumbs = await getBreadcrumbs(session.id, personId);

  return (
    <div className="space-y-8">
      <nav className="flex flex-wrap items-center gap-1 text-sm text-[var(--muted)]">
        <Link href="/liderazgo" className="underline">
          Mi Ministerio
        </Link>
        {crumbs
          .filter((c) => c.personId !== auth.personId)
          .map((c) => (
            <span key={c.personId} className="flex items-center gap-1">
              <span>›</span>
              <Link href={`/liderazgo/${c.personId}`} className="underline">
                {c.fullName}
              </Link>
            </span>
          ))}
      </nav>

      <PageHeader
        title={dashboard.person?.fullName ?? "Líder"}
        description={`${dashboard.leadership.humanLeaderCode ?? ""} · ${dashboard.progress.label}`}
        actions={
          <StatusBadge
            label={dashboard.leadership.status}
            tone={dashboard.leadership.status === "active" ? "success" : "warning"}
          />
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="12 directos" value={dashboard.progress.label} />
        <Kpi label="Descendientes" value={dashboard.descendantLeaders} />
        <Kpi label="Células" value={dashboard.cells.length} />
      </div>

      <section className="space-y-2">
        <h2 className="font-medium">Células</h2>
        <ul className="space-y-2">
          {dashboard.cells.map((cell) => (
            <li key={cell.id}>
              <Link href={`/celulas/${cell.id}`} className="text-sm underline">
                {cell.name} ({cell.type})
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Bajar una generación</h2>
        <ul className="space-y-2">
          {dashboard.directLeaders.map((leader) => (
            <li key={leader.personId}>
              <Link
                href={`/liderazgo/${leader.personId}`}
                className="block rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
              >
                <p className="font-medium">{leader.fullName}</p>
                <p className="text-sm text-[var(--muted)]">{leader.humanLeaderCode}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-2xl font-medium">{value}</p>
    </div>
  );
}
