# API

Base URL: `http://localhost:3001` · JSON everywhere · CORS open.

> All data is real (no mock case, no demo funders). Processed case: `free-mobile-2026`.

## Conventions

- Every object with a `quote` and `page` also has **`quote_verified: boolean`**, computed in code by checking that the quote really appears on that page (or an adjacent one) of the decision. Show a warning badge when it is `false`.
- `page` is `null` when there is no quote (e.g. unsupported claims, assumptions).
- Citations: to show a quote in context, call `GET /cases/:id/pages/:page` and highlight `quote` inside `text`.
- No endpoint ever returns a probability of winning.
- Errors: always JSON `{ "error": "message", "code"?: "..." }`. Show `error` to the user as is.
  - `400` bad input (invalid JSON, missing field, locked brief field) · `404` unknown case, page or route
  - AI service problems: `503` `ai_rate_limited` (try again in a few seconds) · `504` `ai_timeout` · `502` `ai_auth` / `ai_unavailable` / `ai_unreachable` / `ai_bad_output`
  - `500` `internal` (unexpected; the server keeps running)

---

## `GET /health`

```json
{ "ok": true, "mistral_key_set": true }
```

## `GET /cases`

Demo-ready cases (brief, summary and category of harm generated), newest decision first. `?all=true` also lists the mock and partly processed cases (`ready: false`).

```json
[
  {
    "id": "mock-free-2026",
    "defendant": "Free Mobile and Free",
    "date": "2026-01-13",
    "fine_total_eur": 42000000,
    "people_affected": 24000000,
    "data_types": ["identity", "contact", "iban"],
    "mock": true,
    "ready": false
  }
]
```

`data_types` values: `identity`, `contact`, `iban`, `health`, `password`, `other`.

## `GET /cases/:id`

The full case JSON. Abridged example:

```json
{
  "mock": true,
  "case_id": "mock-free-2026",
  "decision": {
    "regulator": "CNIL",
    "reference": "SAN-2026-000 (mock)",
    "date": "2026-01-13",
    "fine_total_eur": 42000000,
    "fines": [
      { "entity": "Free Mobile", "amount_eur": 27000000 },
      { "entity": "Free", "amount_eur": 15000000 }
    ],
    "under_appeal": null,
    "source_url": ""
  },
  "defendant": { "name": "Free Mobile and Free", "legal_form": "private", "sector": "telecommunications", "annual_revenue_eur": null },
  "breach": {
    "date_start": "2024-10-01",
    "date_discovered": "2024-10-01",
    "summary": "An attacker used the credentials of an employee's remote-access account ...",
    "attack_vector": "Compromised VPN credentials of an employee account",
    "data_types": ["identity", "contact", "iban"],
    "sensitive_data": false,
    "people_affected": 24000000,
    "people_affected_unit": "contracts",
    "quote": "La violation concerne les données de plus de 24 millions de contrats d'abonnés, dont certains contenaient l'IBAN de l'abonné.",
    "page": 3,
    "quote_verified": true
  },
  "violations": [
    {
      "gdpr_article": "32",
      "label": "security of processing",
      "finding": "Authentication to the VPN was not robust enough ...",
      "quote": "la procédure d'authentification pour accéder au réseau privé virtuel des sociétés n'était pas suffisamment robuste",
      "page": 4,
      "quote_verified": true
    }
  ],
  "victim_notification": { "notified": true, "adequate": false, "quote": "Les sociétés ont informé les abonnés par courriel.", "page": 5, "quote_verified": true },
  "harm_evidence": { "complaints_count": 2500, "fraud_or_phishing_reported": true, "data_published_or_sold": null, "quote": "...", "page": 3, "quote_verified": false },
  "missing_information": ["decision.under_appeal", "defendant.annual_revenue_eur"]
}
```

Any field may be `null` when the decision doesn't state it; the field is then listed in `missing_information`. `legal_form` is `"private"` or `"public"`. `people_affected_unit` is `"persons"`, `"contracts"` or `"accounts"`.

## `GET /cases/:id/pitch`

The funding brief for the association → investor screen (structured, one block per card), plus the same pitch as Markdown (for export/email). `brief` is `null` for the mock case.

```json
{ "brief": { ... }, "markdown": "## 1. The case in three sentences\n\n..." }
```

### Fields: `{ value, source, quote?, page?, quote_verified?, note? }`

Every value in the brief is a **field** object. Style it by `source`:

| `source` | Meaning | Editable by association |
| --- | --- | --- |
| `decision` | Fact from the CNIL decision (with quote + page when available) | **No** |
| `assessment` | Model's classification, backed by a quote (e.g. solvency, harm nature) | Yes |
| `computed` | Calculated in code (scenarios) | **No** (change the assumptions) |
| `assumption` | From `config/assumptions.json` (legal team) | Yes |
| `association` | Entered or edited by the association (`note: "Edited by the association"`) | Yes |
| `web` | Found by web search, with `source_url` (e.g. latest revenue) | Yes |
| `missing` | Not in the decision, `value: null`, `note` says what's expected (e.g. "To be provided") | Yes |

Show a warning badge when a field has a `quote` and `quote_verified` is `false`.

Enum values:
- `header.status`: `final` | `under_appeal` (or `null` / `missing`)
- `harm.quantified`: `quantified` | `quantifiable` | `to_be_proven`
- `harm.nature`: list of `financial`, `non_material`, `overcharge`, `loss_of_chance`
- `victims.identifiable`: `yes` | `partly` | `no`
- `victims.categories`: list of `consumers`, `businesses`, `retail_investors`, `employees`, `other`
- `defendant.nature`: list of `private_company`, `listed_group`, `public_body`, `association_or_union`
- `defendant.solvency`: `strong` | `medium` | `low`
- `defendant.competent_court`: `civil` | `administrative`
- `value.funder_share`: fraction (0.3 = 30%) · `value.funding_sought_eur`: euros

### Example (Free Mobile, abridged)

```json
{
  "case_id": "free-mobile-2026",
  "generated_at": "2026-10-04T11:01:36.713Z",
  "edited_at": null,
  "header": {
    "action_name": {
      "value": "FREE MOBILE data breach action",
      "source": "computed"
    },
    "defendant": {
      "value": "FREE MOBILE",
      "source": "decision"
    },
    "source_decision": {
      "value": {
        "authority": "CNIL",
        "reference": "Délibération SAN-2026-001 du 8 janvier 2026",
        "date": "2026-01-08"
      },
      "source": "decision"
    },
    "legal_basis": {
      "value": [
        {
          "article": "GDPR art. 34",
          "label": "communication of a personal data breach to the data subject",
          "quote": "le courriel d’information initial n’a pas constitué une c...",
          "page": 21,
          "quote_verified": true
        },
        "..."
      ],
      "source": "decision"
    },
    "status": {
      "value": null,
      "source": "missing",
      "note": "Appeal status not stated in the decision"
    }
  },
  "harm": {
    "quantified": {
      "value": "to_be_proven",
      "source": "assessment",
      "quote": "la formation restreinte considère que l’accès non autoris...",
      "page": 11,
      "quote_verified": true
    },
    "nature": "{ same shape }",
    "description": "{ same shape }"
  },
  "victims": {
    "number": {
      "value": 24633469,
      "source": "decision",
      "quote": "l’attaquant a pu prendre connaissance, des données concer...",
      "page": 3,
      "quote_verified": true,
      "note": "contracts"
    },
    "identifiable": "...",
    "categories": "...",
    "proof_of_membership": "...",
    "subgroups": "..."
  },
  "defendant": {
    "name": "...",
    "nature": "...",
    "solvency": {
      "value": "strong",
      "source": "assessment",
      "quote": "En 2024, le chiffre d’affaires de la société ILIAD était ...",
      "page": 2,
      "quote_verified": true,
      "note": "The parent group ILIAD had a revenue of 10.024 billion euros in 2024."
    },
    "revenue": {
      "value": {
        "amount_eur": 10024000000,
        "entity": "ILIAD",
        "year": 2024
      },
      "source": "decision",
      "quote": "En 2024, le chiffre d’affaires de la société ILIAD était ...",
      "page": 2,
      "quote_verified": true
    },
    "group": "...",
    "insurance": {
      "value": null,
      "source": "missing",
      "note": "Not stated in the decision"
    },
    "competent_court": {
      "value": "civil",
      "source": "assumption"
    }
  },
  "value": {
    "formula": "Total = victims who opt in × compensation per victim",
    "scenarios": {
      "value": [
        {
          "name": "mid",
          "opt_in_rate": 0.02,
          "opt_ins": 492669,
          "compensation_per_victim_eur": 150,
          "total_eur": 73900407
        },
        "low, mid, high"
      ],
      "source": "computed",
      "note": "Opt-in rates and € per victim are assumptions (rate based on: iban)"
    },
    "funding_sought_eur": {
      "value": null,
      "source": "missing",
      "note": "To be set by the association"
    },
    "funder_share": {
      "value": 0.3,
      "source": "assumption"
    },
    "benchmarks_note": "..."
  },
  "timeline": {
    "expected_duration_years": {
      "value": null,
      "source": "missing",
      "note": "To be provided"
    },
    "limitation_ends": "...",
    "facts": {
      "value": {
        "start": "2024-09-28",
        "end": "2024-10-22"
      },
      "source": "decision",
      "quote": "Celle-ci a duré du 28 septembre au 22 octobre 2024.",
      "page": 2,
      "quote_verified": true
    },
    "source_decision": {
      "value": "2026-01-08",
      "source": "decision"
    },
    "filing": {
      "value": null,
      "source": "missing",
      "note": "Target date"
    },
    "judgment_on_liability": "...",
    "victims_opt_in": "...",
    "compensation_paid": "..."
  },
  "association": {
    "name": {
      "value": null,
      "source": "missing",
      "note": "To be provided"
    },
    "certified_since": "...",
    "statutory_purpose_url": "...",
    "counsel": "...",
    "contact": "..."
  },
  "framework": {
    "no_funder_influence": {
      "value": false,
      "source": "association",
      "note": "Confirmed by the association"
    },
    "funding_publicly_disclosed": "...",
    "conflict_of_interest_policy": "...",
    "funder_has_no_ties_to_defendant": "..."
  }
}
```

### Value of the claim (`brief.value`)

Rebuilt on every read from `config/assumptions.json` (the legal team's opt-in table, €150 per victim) and the case's category of harm, so a config change shows up immediately.

- `harm_category`: the row of the legal team's opt-in table used for the scenarios. The model lists every row the decision supports (each with a reason and a verified quote); **a rule in code picks the row**: data-breach rows first when the CNIL found a breach, then the most conservative (lowest base opt-in rate). `note` gives the reason and the rule.
- `category_alternatives.value`: the other rows the decision supports: `[{ category, reason, quote, page, quote_verified, totals: { low, base, high } | null, note }]` — totals computed in code, `null` when the table has no opt-in data for that row. The association can switch it with `PATCH { "edits": { "value.harm_category": "<exact row name>" } }`; anything not in the table → 400. The totals recalculate.
- `scenarios.value`: `[{ name: "low" | "base" | "high", opt_in_rate, opt_ins, compensation_per_victim_eur, total_eur, funder_eur, victims_eur, sources }]` — computed in code; `sources` are the footnote numbers of the legal team's table.
- `opt_in_expected.value`: `{ expected_pct, std_dev_pts }` — expected opt-in in this category across past cases (not a probability of success).
- `compensation_per_victim_eur`: 150 (legal team), editable by the association.

### Legal-team rules: victim identifiability and "is the harm quantified?"

`brief.victims.identifiable` and `brief.harm.quantified` follow the legal team's rules (`prompts/identifiability.txt`, `prompts/harm-quantified.txt`). The value is the level (`yes | partly | no`, `quantified | quantifiable | to_be_proven`); `note` is the ready-to-show sentence, e.g. "Yes: Subscribers notified by email between 24 and 29 October 2024 (§ 21, § 3)"; `detail` holds the reasoning:

```json
{
  "level": "yes",
  "statement": "Subscribers notified by email between 24 and 29 October 2024 …",
  "list_holder": { "answer": "yes", "evidence": "…", "quote": "…", "quote_verified": true, "paragraph": "§ 21", "url": "https://www.legifrance.gouv.fr/…#:~:text=21.%20Au%20total…" },
  "proof": { "answer": "yes", "evidence": "…", "quote": "…", "paragraph": "§ 3", "url": "…" },
  "subgroups": [],
  "weakening": [{ "wording": "anciens abonnés", "explanation": "…", "sources": [{ "paragraph": "§ 34", "url": "…" }, { "paragraph": "§ 37", "url": "…" }] }]
}
```

Harm `detail`: `{ level, justification, quotes: [{ quote, paragraph, url }], subgroups: [{ group, level, justification, paragraph, url }] }`. Every § is found by code from a verified quote (never written by the model) and links to the passage on Légifrance.

### Scores (`brief.scores`)

The legal team's five scores, computed in code on every read (`src/services/scores.ts`, checked by `npm run test-scores` against their Free Mobile test case). Each is `{ score: 0-100, explanation, label? }`, or `{ score: null, reason }` when an input is missing (never defaulted).

```json
{
  "value":     { "score": 79, "explanation": "Base-scenario damages of €147.8M: 25 × log10(total / €100k)." },
  "victims":   { "score": 100, "explanation": "Identifiable yes (40) + proof: individual notification (30) + consumers (15) + 24,633,469 victims (15)." },
  "defendant": { "score": 62, "label": "Medium", "explanation": "Damages €147.8M ÷ net income of FREE MOBILE SAS €730.4M = 20.2% → Medium." },
  "harm":      { "score": 70, "explanation": "to be proven (10) + financial + non material (35) + recognised explicit (§ 82) (25)." },
  "timeline":  { "score": null, "reason": "Limitation period end date not provided (to be confirmed by counsel)" }
}
```

- `defendant` uses the latest **net income** of the defendant entity (web search, `revenue.json`); `brief.defendant.solvency` = its label in lowercase (`strong | medium | low`), `calc: { score, exposure_eur, net_income_eur, ratio, entity, year }`.
- `timeline` needs the association's `timeline.limitation_ends` and `timeline.expected_duration_years`.

### Defendant solvency (`brief.defendant`)

Legal team's rule, computed in code on every read: **exposure ÷ revenue**, where exposure = victims × € per victim × base opt-in rate (the base scenario total). `strong` < 10% · `medium` 10–50% · `low` > 50%.

- `current_revenue`: latest annual revenue found by web search (`source: "web"`, `source_url` = where the figure comes from), or the revenue stated in the decision if none was found (`source: "decision"`). Value `{ amount_eur, entity, year }`. The association can correct it with `PATCH { "edits": { "defendant.current_revenue": { "amount_eur": 500000000, "entity": "…", "year": 2025 } } }`; solvency recalculates.
- `solvency`: `source: "computed"`, value `strong | medium | low`, `note` explains the calculation, `calc: { exposure_eur, revenue_eur, ratio, rule }`. Locked (400 on edit).
- `revenue`: the revenue stated in the decision (may be the parent group's), with its quote.

## `PATCH /cases/:id/brief`

The association edits the brief before sending it to investors. Keys are dot paths to fields; values replace `value`. Returns the updated `{ brief }`. Edits survive pipeline re-runs.

```json
{ "edits": { "association.name": "Association X", "value.funding_sought_eur": 3000000, "framework.no_funder_influence": true } }
```

- An edited field becomes `source: "association"`, its quote is removed, `note: "Edited by the association"`.
- Editing a `decision` or `computed` field → `400 { "error": "victims.number comes from the CNIL decision and cannot be edited" }`.
- Unknown path → `400`. Nothing is saved if any edit in the request is rejected.

## `GET /cases/:id/summary`

Structured summary of the decision (legal team's prompt): Markdown, sections 0–6 (Identification, Facts: Who/What/Where/When, Procedure, Legal basis, Arguments, Decision, Appeal). Every fact ends with a citation link to the paragraph (§) of the decision. ~1,500 words.

```json
{
  "markdown": "### 0. Identification\n\nThe decision is **SAN-2026-001** of **8 January 2026** ... [§ 21](https://www.legifrance.gouv.fr/...#:~:text=prendre%20connaissance%2C%20des%20donn%C3%A9es) ...",
  "citations": [
{
  "id": 1,
  "label": "header",
  "cited_label": "header",
  "page": 1,
  "fragment": "Délibération SAN-2026-001",
  "quote": null,
  "verified": true,
  "note": null
},
{
  "id": 13,
  "label": "§ 20",
  "cited_label": "§ 20",
  "page": null,
  "fragment": "données d’identité, données de contact",
  "quote": null,
  "verified": false,
  "note": "Text fragment not found in the decision."
}
  ],
  "decision_url": null
}
```

- Each citation links to the **official Légifrance text with the cited passage highlighted** (`citations[].url`): the link starts at the paragraph number ("21. Au total, …") and ends at the cited words, which makes it unique on the page. Note: Légifrance scrolls back to the top of the decision after loading, so the reader scrolls down to the highlighted passage.
- Every citation was checked by code: its words must be in the cited paragraph. Wrong § numbers are corrected (`cited_label` = what the model wrote, `label` = where the words actually are).
- `verified: false` → the link text ends with ` ⚠`; show a warning. `note` explains why.

## `GET /cases/:id/brief.html`

The funding brief as an HTML page, same layout as page 1 of the PDF (no summary), with live edits applied. For embedding in an `<iframe>`; links open in a new tab.

## `GET /cases/:id/brief.pdf`

Downloads the funding brief as a PDF (page 1: brief in the card layout, page 2+: structured summary of the decision with § citations). Includes the association's edits. Takes ~2 s.

## `GET /cases/:id/matches`

Funders matched to the case, strong → weak, then legal-team list first. `?limit=N` returns the N best (default: all, ~280). Response also has `total` and `counts: { strong, partial, weak }`. Matching is plain code (no model, no score, no probability): each criterion compares a fact of the case with a fact of the funder's profile.

```json
{
  "case_id": "free-mobile-2026",
  "claim_base_eur": 147800850,
  "matches": [
    {
      "fit": "partial",
      "met": 4, "not_met": 0, "unknown": 1,
      "criteria": [
        { "criterion": "jurisdiction", "status": "met", "detail": "Funds cases in France" },
        { "criterion": "collective_actions", "status": "met", "detail": "Funds collective actions" },
        { "criterion": "case_type", "status": "met", "detail": "Funds data protection / consumer claims" },
        { "criterion": "claim_size", "status": "unknown", "detail": "Minimum claim size not stated" },
        { "criterion": "defendant_type", "status": "met", "detail": "Private defendant" }
      ],
      "note": "Found by the platform's AI agent from public web sources (see sources). Facts not confirmed by the funder; not contacted.",
      "funder": { "id": "…", "name": "Deminor", "origin": "discovered", "website": "https://www.deminor.com/", "sources": [{ "url": "https://www.deminor.com/en/collective-actions/", "title": "…" }], "...": "see GET /funders" }
    }
  ]
}
```

- `fit`: `strong` = the key criteria are confirmed (funder, France, collective actions, case type; plus defendant type when the defendant is a public body) and nothing failed; claim size / public-defendant policy may still be unknown and are listed in `to_confirm`. `partial` = a key criterion is unknown, or one soft criterion failed. `weak` = a hard criterion failed (jurisdiction, collective actions, defendant type, not a funder) or two criteria failed.
- `to_confirm`: criteria still unknown (e.g. `["claim_size"]`), to check with the funder.
- `criterion`: `funder_type` (litigation funder or investment fund; law firms are not funders), `jurisdiction`, `collective_actions`, `case_type`, `claim_size` (base claim vs the funder's minimum), `defendant_type` (public defendants).
- `status`: `met` | `not_met` | `unknown` (unknown is never assumed either way).

## `GET /funders`

All funder profiles: `origin: "curated"` (the legal team's list, from the European Commission study: `funder_type`, France yes/unknown, collective actions yes/unknown, `website` or `lookup_url`; `web_facts` lists fields completed from the web search, with `sources`), `origin: "platform"` (registered; `demo: true` = fictional demo profile) or `origin: "discovered"` (real funders found by the AI web-search agent, shown under their real names, each with the `sources` the facts come from; unknown facts are `null`).

## `POST /funders`

A funder registers on the platform. Returns the profile (`201`). `400` with a message on invalid input.

```json
{
  "name": "Funder name",
  "website": "https://…",
  "description": "…",
  "jurisdictions": ["FR", "BE"],
  "funds_collective_actions": true,
  "case_types": ["data_protection", "consumer"],
  "min_claim_eur": 20000000,
  "max_investment_eur": 15000000,
  "accepts_public_defendants": false,
  "contact": "name@example.org"
}
```

Only `name` is required. `case_types` from: `data_protection`, `consumer`, `competition`, `securities`, `employment`, `environment`, `other`.

## `POST /funders/discover`

Runs the AI agent (Mistral with web search) to find real funders active in French collective actions. ~35 s. Results are saved in `data/funders/discovered.json`; funders already on the legal team's list are merged into their entry (the list's facts win), the others are added as `discovered`. Only URLs returned by the web search are kept as sources; a funder with no source is dropped. The raw search answer is saved in `data/funders/last-search.md` for audit.

## `GET /radar`

Monitoring feed: every CNIL sanction from the CNIL's official list (https://www.cnil.fr/fr/les-sanctions-prononcees-par-la-cnil), triaged for class-action potential. Newest first.

Query (all optional): `status=candidate|candidate_public|filtered`, `priority=high|medium|low`, `since=YYYY-MM-DD`, `breach=true`.

```json
{
  "source": "https://www.cnil.fr/fr/les-sanctions-prononcees-par-la-cnil",
  "scanned_at": "2026-10-04T12:45:00.000Z",
  "from_cache": false,
  "stats": { "total": 394, "data_breaches": 95, "candidates": 34, "candidates_public": 3, "filtered": 357, "high_priority": 7, "new": 1 },
  "items": [
    {
      "id": "2026-01-08_CNILTEXT000053352594",
      "date": "2026-01-08",
      "organisation_type": "OPÉRATEUR DE TÉLÉPHONIE MOBILE",
      "themes": "Durée de conservation Défaut de sécurité des données Obligation de communiquer une violation de données aux personnes concernées",
      "decision": "Amende administrative de 27 millions d'euros et injonction",
      "fine_eur": 27000000,
      "legifrance_url": "https://www.legifrance.gouv.fr/cnil/id/CNILTEXT000053352594",
      "data_breach": true,
      "public_body": false,
      "status": "candidate",
      "priority": "high",
      "reasons": ["Data breach: the CNIL lists \"Défaut de sécurité des données\"", "Victims not properly informed (art. 34) is among the breaches", "Fine: €27,000,000"],
      "case_id": "free-mobile-2026",
      "first_seen_at": "2026-10-04T12:45:00.000Z",
      "is_new": true
    }
  ]
}
```

- Triage is plain rules on the CNIL's own wording (no model): `data_breach` if the CNIL lists data security or a data breach; `public_body` from the organisation type; decisions with no published text (e.g. simplified procedure) are `filtered`.
- `status`: `candidate` (breach, private defendant, published) · `candidate_public` (same, public body: administrative route) · `filtered` (with the reason).
- `priority` (candidates only): `high` fine ≥ €1M · `medium` ≥ €100k · `low`.
- `case_id`: set when the platform already has a brief for this decision → link to `GET /cases/:id/pitch`.
- `is_new`: first seen in the latest scan. The CNIL list does not name organisations (only their type); the name is in the decision on Légifrance.

## `POST /radar/scan`

Fetches the CNIL list and re-triages (~1 s, no model call). If the CNIL site is unreachable, uses the last saved copy (`from_cache: true`). Returns `{ scanned_at, from_cache, total, new, new_items }`.

## Workflow: monitoring → workspace → finalize → send

**Monitoring (background).** The server scans the CNIL list on start-up and every `MONITOR_INTERVAL_HOURS` (default 6; `MONITOR=off` disables it). New candidate decisions trigger an email to the associations in `config/associations.json`. Emails go to an **outbox** (nothing leaves the machine).
- `GET /monitor` → `{ interval_hours, last_run, next_run, last_result: { total, new, new_candidates, emails, from_cache }, error }`
- `POST /monitor/run` → run now (operator/demo use; not for associations)
- `GET /outbox?kind=radar_alert|brief_to_funder` → `[{ id, kind, to, to_name, subject, body (markdown), related, sent_at }]`

**Workspace (association's cases).**
- `GET /workspace` → `[{ radar_id, case_id | null, organisation_type, date, fine_eur, legifrance_url, status: "ready" | "analysis_requested", started_at }]`
- `POST /workspace { radar_id }` → "Work on this case" from the Decisions tab. `ready` when the brief exists (`case_id`), else `analysis_requested`.

**Finalize and send.**
- `POST /cases/:id/finalize` / `POST /cases/:id/reopen` → `{ brief }` with `brief.finalized_at`. While finalized, `PATCH /brief` returns 400.
- `POST /cases/:id/send { funder_ids: [...], message? }` → `{ sent, deliveries }`. 400 if not finalized. One delivery + one outbox email per funder; already-sent funders are skipped.
- `GET /cases/:id/deliveries` → `[{ id, case_id, funder_id, funder_name, message, sent_at }]`; `GET /deliveries` → all of them

**Funder side** (no login: the app picks the funder).
- `GET /funders/:id/pitches` → pitches received: delivery + `{ defendant, action_name, association, decision, victims, victims_unit, claim_low_eur, claim_base_eur, claim_high_eur, harm_category, solvency, funding_sought_eur }`
- `GET /funders/:id/dashboard` → `{ funder, pitches_received, total_claim_base_eur, total_victims, by_category: [{label,n}], by_solvency: [{label,n}], latest }`

## `GET /cases/:id/pages/:n`

One page of the decision text, for showing a citation in context.

```json
{ "page": 3, "text": "4. La violation concerne les données de plus de 24 millions de contrats d'abonnés, ..." }
```

## `POST /cases/:id/chat`

Chatbot over the decision (association or investor). Answers only from the decision text; general class-action procedure is marked as general information. Never gives a chance of winning. Replies in the language of the question. ~7 s.

Request (`history` optional; the last 6 exchanges are used):

```json
{
  "question": "Combien de personnes sont concernées ?",
  "history": [
    { "role": "user", "content": "Quelle est l'amende ?" },
    { "role": "assistant", "content": "27 000 000 euros ..." }
  ]
}
```

Response:

```json
{
  "answer": "La violation de données a concerné **24 633 469 contrats** ... \"Au total, l’attaquant a pu prendre connaissance, des données concernant 24 633 469 contrats, ...\" (p. 3)",
  "citations": [
    { "quote": "Au total, l’attaquant a pu prendre connaissance, des données concernant 24 633 469 contrats, ...", "page": 3, "paragraph": "§ 21", "verified": true }
  ]
}
```

- `answer` is Markdown. Quotes appear as `"..." (p. N)`; open them with `GET /cases/:id/pages/:n` or `/decisions/<id>.pdf#page=N`.
- Every quote is checked by code; slightly reworded quotes are replaced with the decision's exact words. An unverified quote shows `⚠ not found in the decision` in the answer and `verified: false` in `citations`.
- `400` if `question` is missing.

## `POST /cases/:id/chat/stream`

Same body and pipeline as `POST /cases/:id/chat`, streamed as NDJSON (`application/x-ndjson`, one JSON event per line) so the client can show the agent's work live. The model runs with reasoning on (`reasoningEffort: "high"`).

| Event | Fields | When |
| --- | --- | --- |
| `step` | `id`, `label`, `detail`, `status` (`running` / `ok` / `warn`) | When a step starts, and again when it ends (same `id`). Ids: `read`, `think`, `answer`, `check`, `locate`, `filter` |
| `thinking` | `text` | Each delta of the model's reasoning. Shown, not checked |
| `text` | `text` | The answer, one complete sentence at a time; sentences stating a chance of winning are dropped before sending |
| `done` | `answer`, `citations`, `steps` | The checked answer (quotes verified or repaired), which replaces the streamed text |
| `error` | `message` | The agent failed |

## `POST /cases` — *not implemented yet (returns 501)*

Runs the full pipeline on a decision and saves the results. Slow (a minute or more); the demo uses preloaded cases.

Request:

```json
{ "id": "free-2026", "pdf_url": "https://..." }
```

Response: the case JSON, same shape as `GET /cases/:id`.
