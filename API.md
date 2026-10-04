# API

Base URL: `http://localhost:3001` · JSON everywhere · CORS open.

> **Mock data:** `mock-free-2026` is hand-written sample data (`"mock": true`) kept as a stable fixture. Real cases (`free-mobile-2026`, `france-travail-2026`, `hopital-prive-loire-2026`) appear in `GET /cases` as the pipeline produces them; same shapes. Show a "mock" badge when `mock` is true.

## Conventions

- Every object with a `quote` and `page` also has **`quote_verified: boolean`**, computed in code by checking that the quote really appears on that page (or an adjacent one) of the decision. Show a warning badge when it is `false`.
- `page` is `null` when there is no quote (e.g. unsupported claims, assumptions).
- Citations: to show a quote in context, call `GET /cases/:id/pages/:page` and highlight `quote` inside `text`.
- No endpoint ever returns a probability of winning.
- Errors: `{ "error": "message" }` with status `404` (unknown case/page), `400` (bad input or locked field), `500` (server/model failure), `501` (not implemented yet).

---

## `GET /health`

```json
{ "ok": true, "mistral_key_set": true }
```

## `GET /cases`

All cases, newest decision first.

```json
[
  {
    "id": "mock-free-2026",
    "defendant": "Free Mobile and Free",
    "date": "2026-01-13",
    "fine_total_eur": 42000000,
    "people_affected": 24000000,
    "data_types": ["identity", "contact", "iban"],
    "mock": true
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

- Links point to the official Légifrance page and scroll to the cited words (`#:~:text=`) once `decision_url` is set in `config/decisions.json`. Until then they open the local PDF at the right page: `/decisions/<id>.pdf#page=N` (served by the API).
- Every citation was checked by code: its words must be in the cited paragraph. Wrong § numbers are corrected (`cited_label` = what the model wrote, `label` = where the words actually are).
- `verified: false` → the link text ends with ` ⚠`; show a warning. `note` explains why.

## `GET /cases/:id/brief.pdf`

Downloads the funding brief as a PDF (page 1: brief in the card layout with a platform-assessment strip, page 2: platform assessment, page 3+: structured summary of the decision with § citations). Includes the association's edits. Takes ~2 s.

## `GET /cases/:id/scorecard`

Funder check (investor view): every claim of the brief + summary checked against the decision, 7 criteria rated, red flags. No probability of success anywhere.

```json
{
  "claims": [
    {
      "claim": "Defendant: FREE MOBILE",
      "status": "supported",
      "quote": "prononçant une sanction pécuniaire à l'encontre de la société FREE MOBILE",
      "page": 1,
      "note": "",
      "quote_verified": true
    },
    {
      "claim": "Victim subgroups: customers whose IBAN was exposed (convergent customers), customers whose identity, contact, and contractual data were exposed",
      "status": "supported",
      "quote": "leurs données d’identité, leurs données de contact, leurs données contractuelles et, po...",
      "page": 3,
      "note": "Quote not found word for word in the decision: check manually.",
      "quote_verified": false
    },
    {
      "claim": "Harm: The decision recognises a risk of financial harm (e.g., fraudulent payments using exposed IBANs) and non-material harm (e.g., distress, fear of identity theft, phishing attempts) for the affected individuals due to the data breach.",
      "status": "overstated",
      "quote": "exposées à des risques liés à la revente de leurs données à des personnes malveillantes...",
      "page": 11,
      "note": "The decision acknowledges risks but does not explicitly state that financial harm or non-material harm occurred.",
      "quote_verified": true
    },
    {
      "claim": "Is the harm quantified: to_be_proven",
      "status": "assumption",
      "quote": null,
      "page": null,
      "note": "",
      "quote_verified": false
    }
  ],
  "scores": [
    {
      "criterion": "fault_established",
      "rating": "strong",
      "reason": "The CNIL explicitly found breaches of GDPR Articles 5-1-e, 32, and 34.",
      "quote": "manquements aux articles 5-1-e), 32 et 34 du RGPD",
      "page": 3,
      "quote_verified": true
    },
    "... 7 criteria, always in this order"
  ],
  "red_flags": [
    "Appeal status: The decision can be appealed before the Conseil d'État within two months of notification.",
    "Limitation period: Verify the applicable limitation period for GDPR-based claims in France.",
    "..."
  ],
  "summary": "The CNIL decision confirms multiple GDPR breaches by Free Mobile, including data retention, security, and notification failures, affecting a very large group with sensitive data. However, actual harm and recoverability remain speculative and must be proven in court.",
  "counts": {
    "supported": 19,
    "overstated": 1,
    "unsupported": 0,
    "assumption": 8,
    "to_check": 3
  },
  "ratings": {
    "strong": 5,
    "medium": 2,
    "weak": 0
  },
  "checked_at": "2026-10-04T11:37:58.038Z",
  "stale": false,
  "mock": false
}
```

- `status`: `supported` | `overstated` | `unsupported` | `assumption`. A `supported` claim with `quote_verified: false` means the model's quote could not be found word for word: show it as **"to check"** (counted in `counts.to_check`, not in `counts.supported`).
- `rating`: `strong` | `medium` | `weak`, or `null` if the criterion could not be assessed.
- `criterion` (always all 7, in this order): `fault_established`, `data_sensitivity`, `group_size`, `harm_evidence`, `victim_notification_failure`, `defendant`, `recoverability`
- `stale: true` means the association edited the brief after this check: call `POST /cases/:id/check` before sending it to investors.
- The mock case returns the older shape (`counts`, `ratings`, `checked_at` are `null`).

## `POST /cases/:id/check`

Re-runs the funder check on the current brief (association edits included). One model call, **~25 s**. Returns the same shape as `GET /cases/:id/scorecard` with `stale: false`.

## `brief.platform_assessment` (in `GET /cases/:id/pitch`)

The same check, shown on the brief itself so investors see it immediately. **Locked**: `PATCH /cases/:id/brief` on any `platform_assessment.*` path returns 400. `null` if the case has not been checked yet.

```json
{
  "source": "platform",
  "note": "Independent check by the platform against the CNIL decision. Cannot be edited by the association. No probability of success is given.",
  "stale": false,
  "checked_at": "2026-10-04T12:10:00.000Z",
  "counts": { "supported": 19, "to_check": 3, "overstated": 1, "unsupported": 0, "assumption": 8 },
  "ratings": { "strong": 5, "medium": 2, "weak": 0 },
  "scores": [ "... same as scorecard.scores" ],
  "red_flags": [ "..." ],
  "summary": "..."
}
```

## `GET /cases/:id/pages/:n`

One page of the decision text, for showing a citation in context.

```json
{ "page": 3, "text": "4. La violation concerne les données de plus de 24 millions de contrats d'abonnés, ..." }
```

## `POST /cases/:id/chat` — *not implemented yet (returns 501)*

Request:

```json
{
  "question": "Combien de personnes sont concernées ?",
  "history": [
    { "role": "user", "content": "Quelle est l'amende ?" },
    { "role": "assistant", "content": "42 millions d'euros au total ..." }
  ]
}
```

Response:

```json
{ "answer": "La violation concerne plus de 24 millions de contrats : \"La violation concerne les données de plus de 24 millions de contrats d'abonnés\" (p. 3)." }
```

## `POST /cases` — *not implemented yet (returns 501)*

Runs the full pipeline on a decision and saves the results. Slow (a minute or more); the demo uses preloaded cases.

Request:

```json
{ "id": "free-2026", "pdf_url": "https://..." }
```

Response: the case JSON, same shape as `GET /cases/:id`.
