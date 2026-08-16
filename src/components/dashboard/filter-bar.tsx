import { SegmentedControl } from "@/components/dashboard/segmented-control";
import { cn } from "@/lib/cn";

export type FilterOption = { id: string; label: string };

type FilterBarProps = {
  period: string;
  ministryId?: string;
  networkId?: string;
  rootPersonId?: string | null;
  ministries: FilterOption[];
  networks: FilterOption[];
  showMinistryFilter: boolean;
  className?: string;
};

const PERIOD_OPTIONS = [
  { value: "this_week", label: "Esta semana" },
  { value: "this_month", label: "Este mes" },
  { value: "last_30", label: "30 días" },
  { value: "last_90", label: "90 días" },
  { value: "this_year", label: "Este año" },
];

const selectClass =
  "neo-touch min-w-[9rem] rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]";

/**
 * GET filters — same search params as before (periodo, ministerio, red, raiz).
 */
export function FilterBar({
  period,
  ministryId = "",
  networkId = "",
  rootPersonId,
  ministries,
  networks,
  showMinistryFilter,
  className,
}: FilterBarProps) {
  return (
    <form
      method="get"
      className={cn(
        "flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--shadow-card)] sm:p-4",
        className,
      )}
      aria-label="Filtros del dashboard"
    >
      <div className="overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <SegmentedControl
          name="periodo"
          legend="Período"
          defaultValue={period}
          options={PERIOD_OPTIONS}
        />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {showMinistryFilter ? (
          <div className="min-w-0">
            <label htmlFor="ministerio" className="mb-1 block text-xs text-[var(--muted)]">
              Ministerio
            </label>
            <select
              id="ministerio"
              name="ministerio"
              defaultValue={ministryId}
              className={selectClass}
            >
              <option value="">Todos los ministerios</option>
              {ministries.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="min-w-0">
          <label htmlFor="red" className="mb-1 block text-xs text-[var(--muted)]">
            Red
          </label>
          <select id="red" name="red" defaultValue={networkId} className={selectClass}>
            <option value="">Todas las redes</option>
            {networks.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
        </div>

        {rootPersonId ? <input type="hidden" name="raiz" value={rootPersonId} /> : null}

        <button
          type="submit"
          className="neo-touch inline-flex items-center rounded-[var(--radius-sm)] bg-[var(--vermilion)] px-4 py-2 text-sm font-medium text-white transition-colors duration-[var(--motion-fast)] hover:bg-[var(--vermilion-dark)]"
        >
          Aplicar
        </button>
      </div>
    </form>
  );
}
