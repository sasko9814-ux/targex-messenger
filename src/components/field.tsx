import type { InputHTMLAttributes, ReactNode } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string | undefined;
  hint?: ReactNode | undefined;
};

export function Field({ label, error, hint, id, ...rest }: Props) {
  const fid = id ?? rest.name;
  return (
    <div className="space-y-1.5">
      <label htmlFor={fid} className="text-sm font-medium text-muted-foreground">
        {label}
      </label>
      <input
        id={fid}
        aria-invalid={!!error}
        className="h-12 w-full rounded-xl border border-input bg-surface px-4 text-base outline-none transition focus:border-primary focus:ring-2 focus:ring-ring aria-[invalid=true]:border-destructive"
        {...rest}
      />
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
