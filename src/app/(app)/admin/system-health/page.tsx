import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { isSuperadmin } from "@/modules/authorization";
import { runIntegrityChecks } from "@/modules/reporting";
import { requireAppActor } from "@/server/actor";

export const metadata = { title: "System health" };

export default async function SystemHealthPage() {
  const { auth } = await requireAppActor();
  if (!isSuperadmin(auth)) {
    redirect("/dashboard");
  }

  const report = await runIntegrityChecks();

  return (
    <div className="space-y-6">
      <PageHeader
        title="System health"
        description="Chequeos de integridad read-only. Sin auto-repair. Solo Superadmin."
        actions={
          <Link href="/dashboard" className="text-sm underline">
            Dashboard
          </Link>
        }
      />

      <div className="flex flex-wrap gap-3">
        <StatusBadge
          label={report.healthy ? "HEALTHY" : "VIOLATIONS"}
          tone={report.healthy ? "success" : "warning"}
        />
        <StatusBadge label={`critical ${report.criticalCount}`} tone="warning" />
        <StatusBadge label={`warning ${report.warningCount}`} tone="brand" />
      </div>

      <p className="text-xs text-[var(--muted)]">
        Checked at {new Date(report.checkedAt).toLocaleString("es-PE")}
      </p>

      {report.violations.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Sin violaciones detectadas.</p>
      ) : (
        <ul className="space-y-3">
          {report.violations.map((v) => (
            <li
              key={v.code}
              className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  label={v.severity}
                  tone={v.severity === "critical" ? "warning" : "brand"}
                />
                <span className="font-medium">{v.title}</span>
                <span className="text-[var(--muted)]">×{v.count}</span>
              </div>
              <p className="mt-2 font-mono text-xs text-[var(--muted)]">{v.code}</p>
              {v.sampleIds.length ? (
                <p className="mt-2 break-all text-xs text-[var(--muted)]">
                  samples: {v.sampleIds.join(", ")}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
