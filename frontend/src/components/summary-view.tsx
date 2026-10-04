"use client";

import { useMemo } from "react";
import { renderMarkdown } from "@/lib/markdown";

type Section = { id: string; num: string; title: string; html: string };

// § links become small chips; unverified ones (marked ⚠ by the backend) are amber.
function chipCitations(html: string) {
  return html.replace(/<a ([^>]*)>([^<]*)<\/a>/g, (_m, attrs: string, text: string) => {
    const warn = text.includes("⚠");
    const label = text.replace(/\s*⚠\s*/g, "").trim();
    return `<a ${attrs} class="cite${warn ? " cite-warn" : ""}" title="${warn ? "Could not be verified against the decision" : "Open the passage on Légifrance"}">${warn ? "⚠ " : ""}${label}</a>`;
  });
}

// Split the legal team's summary (sections 0-6) into cards.
function splitSections(markdown: string): Section[] {
  const parts = markdown.split(/\n(?=#{1,4}\s*\d+\.\s)/);
  return parts
    .map((part, i) => {
      const m = part.match(/^#{1,4}\s*(\d+)\.\s*(.+)\n?/);
      const body = m ? part.slice(m[0].length) : part;
      return { id: `s-${i}`, num: m?.[1] ?? "", title: m?.[2]?.trim() ?? "", html: chipCitations(renderMarkdown(body.replace(/^\s*---\s*$/gm, ""))) };
    })
    .filter((s) => s.title || s.html.trim());
}

const prose =
  "max-w-[72ch] text-[15.5px] leading-[1.75] text-muted " +
  "[&_p]:my-3 [&_strong]:font-semibold [&_strong]:text-paper [&_em]:text-paper " +
  "[&_h2]:mt-7 [&_h2]:mb-1 [&_h2]:font-mono [&_h2]:text-[11px] [&_h2]:uppercase [&_h2]:tracking-[0.14em] [&_h2]:text-gold [&_h2]:font-normal " +
  "[&_h3]:mt-6 [&_h3]:mb-1 [&_h3]:font-mono [&_h3]:text-[11px] [&_h3]:uppercase [&_h3]:tracking-[0.14em] [&_h3]:text-gold " +
  "[&_h4]:mt-6 [&_h4]:mb-1 [&_h4]:font-mono [&_h4]:text-[11px] [&_h4]:uppercase [&_h4]:tracking-[0.14em] [&_h4]:text-gold " +
  "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-1.5 [&_hr]:hidden";

export function SummaryView({ markdown, total, unverified }: { markdown: string; total: number; unverified: number }) {
  const sections = useMemo(() => splitSections(markdown), [markdown]);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
      <nav className="sticky top-4 hidden lg:block" aria-label="Summary sections">
        <p className="eyebrow mb-3">Contents</p>
        <ol className="space-y-1 border-l border-line">
          {sections
            .filter((s) => s.title)
            .map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="-ml-px block border-l-2 border-transparent py-1 pl-3 text-[13px] text-muted hover:border-gold hover:text-paper">
                  <span className="mr-1.5 font-mono text-[11px] text-faint">{s.num}</span>
                  {s.title}
                </a>
              </li>
            ))}
        </ol>
      </nav>

      <div className="space-y-4">
        <div className="card flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3 text-[13px] text-muted">
          <span className="inline-flex items-center gap-2">
            <span className="rounded-md bg-sky/70 px-1.5 py-px font-mono text-[11px] text-gold-2">§ 21</span> paragraph of the decision · opens Légifrance with the passage highlighted
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="rounded-md bg-[#fffaeb] px-1.5 py-px font-mono text-[11px] text-[#b54708]">⚠ § 20</span>
            could not be verified ({unverified} of {total})
          </span>
        </div>

        {sections.map((s, i) => (
          <section key={s.id} id={s.id} className={`card rise rise-${Math.min(i + 1, 4)} scroll-mt-6 p-6 md:p-8`}>
            {s.title ? (
              <header className="mb-2 flex items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-paper font-mono text-[12px] text-white">{s.num}</span>
                <h2 className="font-serif text-2xl text-paper">{s.title}</h2>
              </header>
            ) : null}
            <div className={prose} dangerouslySetInnerHTML={{ __html: s.html }} />
          </section>
        ))}
      </div>
    </div>
  );
}
