import type { ReactNode } from "react";

export const primaryLink =
  "inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-fill px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-fill-2";

export const secondaryLink =
  "inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-elevated px-4 text-sm font-semibold text-paper transition-colors duration-200 hover:bg-hover";

export const primaryButton = `${primaryLink} disabled:cursor-not-allowed disabled:opacity-40`;

export function Kicker({ n, children }: { n?: string; children: ReactNode }) {
  return (
    <p className="text-[13px] font-medium tracking-[-0.01em] text-muted">
      {n ? <span className="mr-2 text-gold">{n}</span> : null}
      {children}
    </p>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-elevated px-2.5 py-1 text-[11px] font-medium text-muted">
      {children}
    </span>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "h-11 w-full rounded-xl border border-transparent bg-elevated px-3 text-sm text-paper outline-none transition-colors duration-200 placeholder:text-faint focus:border-gold";
