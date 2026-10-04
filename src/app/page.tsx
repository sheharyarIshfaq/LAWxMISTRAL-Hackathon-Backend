import Link from "next/link";
import { Kicker, primaryLink, secondaryLink } from "@/components/ui";
import { API_URL, day, eur, num, type CaseListItem } from "@/lib/api";

// Live cases from the backend; the page still renders if the backend is down.
async function liveCases(): Promise<CaseListItem[]> {
  try {
    const res = await fetch(`${API_URL}/cases`, { cache: "no-store" });
    return res.ok ? await res.json() : [];
  } catch {
    return [];
  }
}

const STEPS = [
  ["Radar", "Every sanction the CNIL publishes is scanned. Data breaches with a private defendant and a published decision are flagged, with the reason in the CNIL's own words."],
  ["Summary", "The decision is summarised by the legal team's method: facts, procedure, breaches, arguments, sanction. Every fact cites its paragraph and links to Légifrance."],
  ["Funding brief", "The association gets a brief it can edit and send: harm, victims, defendant solvency, value of the claim. Figures come from the legal team's opt-in table, computed in code."],
  ["Matchmaking", "The brief is matched against the legal team's list of funders, completed by web search, criterion by criterion. Unknown facts stay unknown."],
  ["Questions", "Funders read the brief and question the decision directly. Answers quote the decision, word for word, and never give a chance of winning."],
];

const RULES = [
  ["Traceable", "Every quote is checked word for word against the decision by code; the paragraph (§) is found by code, never by the model."],
  ["Computed, not generated", "Opt-in rates, claim values and solvency are calculated in code from the legal team's tables. The model never does the arithmetic."],
  ["No win probability", "A CNIL sanction establishes a regulatory breach, not liability in court. Bina.ai never estimates the chance of winning."],
];

export default async function Home() {
  const cases = await liveCases();
  return (
    <div>
      <section className="mx-auto grid max-w-6xl gap-12 px-4 pb-8 pt-14 md:px-6 md:pt-20 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
        <div>
          <Kicker n="01">CNIL sanctions, turned into fundable collective actions</Kicker>
          <h1 className="mt-4 max-w-3xl font-serif text-5xl leading-[0.95] tracking-tight text-paper md:text-7xl">From a CNIL sanction to a funded action de groupe.</h1>
          <div className="mt-6 h-0.5 w-10 rounded-full bg-gold" aria-hidden />
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
            When the CNIL sanctions a data breach, its decision already establishes the fault, the facts and the number of people affected. Bina.ai finds those
            decisions, builds the funding brief an association can send under the law of 30 April 2025, and matches it with litigation funders.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/desk" className={primaryLink}>
              I represent an association
            </Link>
            <Link href="/book" className={secondaryLink}>
              I represent a funder
            </Link>
          </div>
        </div>
        <aside className="surface">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-gold">Cases ready</span>
            <span className="font-mono text-[11px] text-faint">{cases.length} case{cases.length === 1 ? "" : "s"}</span>
          </div>
          <ul>
            {cases.map((c) => (
              <li key={c.id} className="border-b border-line last:border-b-0">
                <Link href={`/desk/cases/${c.id}`} className="block cursor-pointer px-4 py-4 transition-colors duration-200 hover:bg-ink">
                  <p className="font-serif text-2xl text-paper">{c.defendant ?? c.id}</p>
                  <p className="mt-1 text-sm text-muted">CNIL · {day(c.date)}</p>
                  <p className="mt-3 flex items-baseline justify-between font-mono text-xs text-faint">
                    <span className="text-gold tabular-nums">Fine {eur(c.fine_total_eur)}</span>
                    <span>{num(c.people_affected)} affected</span>
                  </p>
                </Link>
              </li>
            ))}
            {!cases.length ? <li className="px-4 py-6 text-sm text-faint">Start the backend to see the cases.</li> : null}
          </ul>
        </aside>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 md:px-6">
        <Kicker n="02">How a case moves</Kicker>
        <ol className="mt-8 grid gap-3 md:grid-cols-5">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="surface p-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-gold">0{i + 1}</p>
              <h2 className="mt-3 font-serif text-2xl">{title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6">
          <Kicker n="03">Built for trust</Kicker>
          <h2 className="mt-3 font-serif text-4xl tracking-tight">Every fact traceable to the decision.</h2>
          <ul className="mt-8 grid gap-3 md:grid-cols-3">
            {RULES.map(([title, text]) => (
              <li key={title} className="surface p-5">
                <h3 className="font-serif text-2xl">{title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted">{text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
