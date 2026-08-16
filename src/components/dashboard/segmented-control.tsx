import { cn } from "@/lib/cn";

export type SegmentOption = {
  value: string;
  label: string;
};

type SegmentedControlProps = {
  name: string;
  options: SegmentOption[];
  defaultValue: string;
  legend: string;
  className?: string;
};

/**
 * Accessible radio-group styled as editorial segments.
 * Submits with the surrounding GET form (shareable URL).
 */
export function SegmentedControl({
  name,
  options,
  defaultValue,
  legend,
  className,
}: SegmentedControlProps) {
  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className="sr-only">{legend}</legend>
      <div
        className="inline-flex max-w-full flex-wrap gap-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-1"
        role="radiogroup"
        aria-label={legend}
      >
        {options.map((opt) => (
          <label
            key={opt.value}
            className={cn(
              "relative cursor-pointer rounded-[var(--radius-sm)] px-3 py-2 text-sm transition-colors duration-[var(--motion-fast)]",
              "has-[:checked]:bg-[var(--cobalt)] has-[:checked]:text-white",
              "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)]",
              "text-[var(--muted)] hover:text-[var(--ink)]",
            )}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              defaultChecked={opt.value === defaultValue}
              className="sr-only"
            />
            <span className="whitespace-nowrap">{opt.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
