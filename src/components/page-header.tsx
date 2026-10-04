import type { ReactNode } from "react";

// Page title block: mono eyebrow, serif title, one-line description, optional actions on the right.
export function PageHeader({ eyebrow, title, description, children }: { eyebrow: string; title: string; description?: ReactNode; children?: ReactNode }) {
  return (
    <div className="rise flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-1.5 font-serif text-4xl tracking-tight text-paper">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-faint">{description}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}
