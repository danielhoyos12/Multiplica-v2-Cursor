import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

import { cn } from "@/lib/cn";

const fieldClass =
  "w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]";

export function FieldGroup({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-[var(--ink)]">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="text-xs text-[var(--muted)]">{hint}</p> : null}
      {error ? (
        <p className="text-xs text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "space-y-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] sm:p-5",
        className,
      )}
    >
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-lg tracking-tight text-[var(--ink)]">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function TextField({
  id,
  label,
  hint,
  error,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
}) {
  const fieldId = id ?? props.name ?? label;
  return (
    <FieldGroup id={fieldId} label={label} hint={hint} error={error}>
      <input id={fieldId} className={cn(fieldClass, className)} {...props} />
    </FieldGroup>
  );
}

export function SelectField({
  id,
  label,
  hint,
  error,
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  const fieldId = id ?? props.name ?? label;
  return (
    <FieldGroup id={fieldId} label={label} hint={hint} error={error}>
      <select id={fieldId} className={cn(fieldClass, className)} {...props}>
        {children}
      </select>
    </FieldGroup>
  );
}

export function TextAreaField({
  id,
  label,
  hint,
  error,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string;
  error?: string;
}) {
  const fieldId = id ?? props.name ?? label;
  return (
    <FieldGroup id={fieldId} label={label} hint={hint} error={error} className="sm:col-span-2">
      <textarea id={fieldId} className={cn(fieldClass, "min-h-24", className)} {...props} />
    </FieldGroup>
  );
}

export function CheckboxField({
  id,
  label,
  hint,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
}) {
  const fieldId = id ?? props.name ?? label;
  return (
    <div className={cn("flex items-start gap-2 sm:col-span-2", className)}>
      <input
        id={fieldId}
        type="checkbox"
        className="mt-1 size-4 rounded border-[var(--border)]"
        {...props}
      />
      <div>
        <label htmlFor={fieldId} className="text-sm font-medium text-[var(--ink)]">
          {label}
        </label>
        {hint ? <p className="text-xs text-[var(--muted)]">{hint}</p> : null}
      </div>
    </div>
  );
}
