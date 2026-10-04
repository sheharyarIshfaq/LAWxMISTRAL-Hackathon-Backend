"use client";

import { useEffect, useState } from "react";
import { ApiError, editBrief, getPitch, type Brief } from "@/lib/api";

// Only what belongs to the association (never the facts of the decision, which the backend locks).
type Def = { path: string; label: string; kind: "text" | "number" | "date" | "check"; hint?: string };
const GROUPS: { title: string; fields: Def[] }[] = [
  {
    title: "Your association",
    fields: [
      { path: "association.name", label: "Name", kind: "text" },
      { path: "association.certified_since", label: "Certified since", kind: "text", hint: "e.g. 12 March 2019" },
      { path: "association.statutory_purpose_url", label: "Statutory purpose (link)", kind: "text" },
      { path: "association.counsel", label: "Counsel (law firm)", kind: "text" },
      { path: "association.contact", label: "Contact (name, role, email)", kind: "text" },
    ],
  },
  {
    title: "Funding",
    fields: [{ path: "value.funding_sought_eur", label: "Funding sought (€)", kind: "number", hint: "e.g. 3000000" }],
  },
  {
    title: "Timeline (estimates by your counsel)",
    fields: [
      { path: "timeline.expected_duration_years", label: "Expected duration (years)", kind: "number" },
      { path: "timeline.limitation_ends", label: "Limitation period ends", kind: "date" },
      { path: "timeline.filing", label: "Filing (target date)", kind: "text" },
      { path: "timeline.judgment_on_liability", label: "Judgment on liability (estimate)", kind: "text" },
      { path: "timeline.victims_opt_in", label: "Victims opt in (period)", kind: "text" },
      { path: "timeline.compensation_paid", label: "Compensation paid (estimate)", kind: "text" },
    ],
  },
  {
    title: "Funding framework (art. 16, law of 30 April 2025)",
    fields: [
      { path: "framework.no_funder_influence", label: "No funder influence over the conduct of the action", kind: "check" },
      { path: "framework.funding_publicly_disclosed", label: "Funding publicly disclosed", kind: "check" },
      { path: "framework.conflict_of_interest_policy", label: "Written conflict-of-interest policy", kind: "check" },
      { path: "framework.funder_has_no_ties_to_defendant", label: "Funder has no ties to the defendant", kind: "check" },
    ],
  },
];

const get = (b: Brief, path: string) => path.split(".").reduce<any>((o, k) => o?.[k], b)?.value ?? null; // eslint-disable-line @typescript-eslint/no-explicit-any

export function BriefEditor({ caseId, locked, onSaved }: { caseId: string; locked: boolean; onSaved: () => void }) {
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [initial, setInitial] = useState<Record<string, string | boolean>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getPitch(caseId).then(({ brief }) => {
      const v: Record<string, string | boolean> = {};
      for (const g of GROUPS) for (const f of g.fields) v[f.path] = f.kind === "check" ? Boolean(get(brief, f.path)) : (get(brief, f.path) ?? "").toString();
      setValues(v);
      setInitial(v);
    });
  }, [caseId]);

  const changed = Object.keys(values).filter((k) => values[k] !== initial[k]);

  const save = async () => {
    const edits: Record<string, unknown> = {};
    for (const k of changed) {
      const def = GROUPS.flatMap((g) => g.fields).find((f) => f.path === k)!;
      const v = values[k];
      edits[k] = def.kind === "check" ? v : v === "" ? null : def.kind === "number" ? Number(v) : v;
    }
    setSaving(true);
    try {
      await editBrief(caseId, edits);
      setInitial(values);
      setStatus("Saved. The brief is updated.");
      onSaved();
    } catch (e) {
      setStatus((e as ApiError).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl bg-panel p-4">
      <p className="text-[13px] text-faint">
        Add your association&apos;s details. Facts from the CNIL decision are locked and can&apos;t be edited.
        {locked ? " The brief is finalized: reopen it to edit." : ""}
      </p>
      <fieldset disabled={locked} className="mt-3 space-y-5 disabled:opacity-60">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">{g.title}</p>
            <div className="mt-2 space-y-2">
              {g.fields.map((f) =>
                f.kind === "check" ? (
                  <label key={f.path} className="flex cursor-pointer items-start gap-2 text-sm text-muted">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4"
                      checked={Boolean(values[f.path])}
                      onChange={(e) => setValues((v) => ({ ...v, [f.path]: e.target.checked }))}
                    />
                    {f.label}
                  </label>
                ) : (
                  <label key={f.path} className="block">
                    <span className="text-[12px] text-faint">{f.label}</span>
                    <input
                      type={f.kind === "number" ? "number" : f.kind === "date" ? "date" : "text"}
                      placeholder={f.hint}
                      value={(values[f.path] as string) ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [f.path]: e.target.value }))}
                      className="mt-0.5 h-9 w-full rounded-lg border border-line bg-white px-2.5 text-sm outline-none focus:border-gold"
                    />
                  </label>
                )
              )}
            </div>
          </div>
        ))}
      </fieldset>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={locked || saving || !changed.length}
          className="h-10 cursor-pointer rounded-xl bg-fill px-4 text-sm font-semibold text-white hover:bg-fill-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Saving…" : changed.length ? `Save ${changed.length} change${changed.length > 1 ? "s" : ""}` : "Saved"}
        </button>
        {status ? <p className="text-[13px] text-muted">{status}</p> : null}
      </div>
    </div>
  );
}
