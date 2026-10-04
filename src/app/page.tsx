import Link from "next/link";
import { ArrowRight, Calculator, Quote, ShieldOff } from "lucide-react";
import { primaryLink, secondaryLink } from "@/components/ui";
import { Logo } from "@/components/logo";
import { API_URL, day, eur, num, type CaseListItem } from "@/lib/api";

// Live data from the backend; the page still renders if the backend is down.
async function get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, { cache: "no-store" });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

type Score = { score: number | null; label?: string };
type PitchPreview = {
  brief: {
    header: { action_name: { value: string } };
    value: { scenarios: { value: { name: string; total_eur: number }[] | null } };
    scores?: Record<string, Score>;
  };
};

const STEPS: [string, string][] = [
  ["Radar", "Every CNIL sanction is scanned on a schedule. Data breaches worth a collective action are emailed to associations."],
  ["Summary", "Each decision is summarised with the legal team's method. Every fact links to its paragraph on Légifrance."],
  ["Brief", "The association completes and finalizes a funding brief: harm, victims, defendant, value, timeline, five scores."],
  ["Funders", "The brief is matched against the legal team's list of funders, criterion by criterion, then sent."],
  ["Questions", "Funders question the decision through an agent that quotes it word for word."],
];

const RULES = [
  { icon: Quote, title: "Traceable", text: "Every quote is checked word for word against the decision by code. The paragraph (§) is found by code, never by the model." },
  { icon: Calculator, title: "Computed, not generated", text: "Opt-in rates, claim values and scores come from the legal team's tables and formulas, in code. The model never does the arithmetic." },
  { icon: ShieldOff, title: "No win probability", text: "A CNIL sanction establishes a regulatory breach, not liability in court. Bina.ai never estimates the chance of winning." },
];

const SCORE_LABELS: [string, string][] = [["value", "Value"], ["victims", "Victims"], ["defendant", "Defendant"], ["harm", "Harm"], ["timeline", "Timeline"]];

export default async function Home() {
  const [cases, radar, funders] = await Promise.all([
    get<CaseListItem[]>("/cases"),
    get<{ stats: { total: number; data_breaches: number } }>("/radar"),
    get<unknown[]>("/funders"),
  ]);
  const featured = cases?.find((c) => c.id === "free-mobile-2026") ?? cases?.[0];
  const pitch = featured ? await get<PitchPreview>(`/cases/${featured.id}/pitch`) : null;
  const base = pitch?.brief.value.scenarios.value?.find((s) => s.name === "base")?.total_eur ?? null;

  const figures: [string, string][] = [
    [radar ? num(radar.stats.total) : "—", "CNIL sanctions scanned"],
    [radar ? num(radar.stats.data_breaches) : "—", "data breaches flagged"],
    [cases ? String(cases.length) : "—", "cases with a brief"],
    [funders ? num(funders.length) : "—", "funders on the list"],
  ];

  return (
    <div className="overflow-hidden">
      {/* Hero */}
      <section className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-14 md:px-6 md:pt-20 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-10 opacity-[0.05]">
          <Logo size={560} />
        </div>
        <div className="relative">
          <p className="eyebrow rise">CNIL sanctions → collective actions</p>
          <h1 className="rise rise-1 mt-5 max-w-3xl font-serif text-5xl leading-[0.98] tracking-tight text-paper md:text-[4.6rem]">
            From a CNIL sanction to a <em className="text-gold">funded</em> action de groupe.
          </h1>
          <p className="rise rise-2 mt-6 max-w-xl text-lg leading-relaxed text-muted">
            When the CNIL sanctions a data breach, its decision already establishes the fault, the facts and the people affected. Bina.ai finds those decisions,
            prepares the funding brief an association can send under the law of 30 April 2025, and matches it with litigation funders.
          </p>
          <div className="rise rise-3 mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/desk" className={primaryLink}>
              I represent an association <ArrowRight className="size-4" />
            </Link>
            <Link href="/book" className={secondaryLink}>
              I represent a funder
            </Link>
          </div>
        </div>

        {/* Live brief preview */}
        <div className="rise rise-4 relative">
          <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-br from-sky via-white/40 to-transparent blur-2xl" />
          {featured ? (
            <Link href={`/desk/cases/${featured.id}`} className="card block overflow-hidden transition hover:-translate-y-1">
              <div className="bg-paper px-5 py-4 text-white">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-sky">Funding brief · live</p>
                <p className="mt-1 font-serif text-2xl">{pitch?.brief.header.action_name.value ?? featured.defendant}</p>
                <p className="mt-1 text-[12px] text-sky/90">CNIL · {day(featured.date)}</p>
              </div>
              <dl className="grid grid-cols-3 divide-x divide-line border-b border-line">
                {[
                  ["Fine", eur(featured.fine_total_eur)],
                  ["Affected", num(featured.people_affected)],
                  ["Claim (base)", eur(base)],
                ].map(([k, v]) => (
                  <div key={k} className="px-4 py-3">
                    <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">{k}</dt>
                    <dd className="mt-1 font-serif text-xl tabular-nums text-paper">{v}</dd>
                  </div>
                ))}
              </dl>
              {pitch?.brief.scores ? (
                <div className="space-y-2.5 px-5 py-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">Scores · legal team&apos;s formulas</p>
                  {SCORE_LABELS.map(([k, label]) => {
                    const s = pitch.brief.scores![k];
                    return (
                      <div key={k} className="grid grid-cols-[84px_1fr_44px] items-center gap-3 text-[13px]">
                        <span className="text-muted">{label}</span>
                        <span className="h-1.5 rounded-full bg-elevated">
                          <span className="block h-1.5 rounded-full bg-gold" style={{ width: `${s?.score ?? 0}%` }} />
                        </span>
                        <span className="text-right font-mono tabular-nums text-paper">{s?.score ?? "—"}</span>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              <p className="border-t border-line px-5 py-3 text-[12px] text-faint">Every figure traceable to the decision · no win probability</p>
            </Link>
          ) : (
            <div className="card p-6 text-sm text-faint">Start the backend to see a live brief.</div>
          )}
        </div>
      </section>

      {/* Live figures */}
      <section className="border-y border-line bg-panel/70">
        <dl className="mx-auto grid max-w-6xl grid-cols-2 px-4 md:grid-cols-4 md:px-6">
          {figures.map(([n, label]) => (
            <div key={label} className="border-line py-6 pr-4 md:border-r md:pl-6 md:first:pl-0 md:last:border-r-0">
              <dt className="sr-only">{label}</dt>
              <dd className="font-serif text-4xl tabular-nums text-paper">{n}</dd>
              <p className="mt-1 text-sm text-faint">{label}</p>
            </div>
          ))}
        </dl>
      </section>

      {/* How a case moves */}
      <section className="mx-auto max-w-6xl px-4 py-20 md:px-6">
        <p className="eyebrow">How a case moves</p>
        <h2 className="mt-3 max-w-2xl font-serif text-4xl tracking-tight text-paper">From the CNIL&apos;s decision to the funder&apos;s questions, in five steps.</h2>
        <ol className="relative mt-12 grid gap-8 md:grid-cols-5 md:gap-6">
          <span aria-hidden className="absolute left-4 right-4 top-4 hidden h-px bg-gradient-to-r from-gold/60 via-gold/30 to-transparent md:block" />
          {STEPS.map(([title, text], i) => (
            <li key={title} className="relative">
              <span className="relative z-10 flex size-8 items-center justify-center rounded-full bg-paper font-mono text-[12px] text-white ring-4 ring-ink">{i + 1}</span>
              <h3 className="mt-4 font-serif text-2xl text-paper">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Built for trust */}
      <section className="bg-paper text-white">
        <div className="mx-auto max-w-6xl px-4 py-20 md:px-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-sky">Built for trust</p>
          <h2 className="mt-3 max-w-2xl font-serif text-4xl tracking-tight">Every fact traceable to the decision.</h2>
          <ul className="mt-10 grid gap-6 md:grid-cols-3">
            {RULES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
                <span className="flex size-10 items-center justify-center rounded-xl bg-white/10 text-sky">
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-5 font-serif text-2xl">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/70">{text}</p>
              </li>
            ))}
          </ul>
          <div className="mt-12 flex flex-col gap-3 sm:flex-row">
            <Link href="/desk" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-paper hover:bg-sky">
              Open the association desk <ArrowRight className="size-4" />
            </Link>
            <Link href="/book" className="inline-flex h-11 items-center justify-center rounded-xl border border-white/20 px-5 text-sm font-semibold text-white hover:bg-white/10">
              Open the funder desk
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
