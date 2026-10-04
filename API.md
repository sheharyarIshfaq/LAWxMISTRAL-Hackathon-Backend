# API

Base URL: `http://localhost:3001` · JSON everywhere · CORS open.

> **Mock data:** `mock-free-2026` is hand-written sample data (`"mock": true`) kept as a stable fixture. Real cases (`free-mobile-2026`, `free-2026`, `france-travail-2026`, `hopital-prive-loire-2026`) appear in `GET /cases` as the pipeline produces them; same shapes. Show a "mock" badge when `mock` is true.

## Conventions

- Every object with a `quote` and `page` also has **`quote_verified: boolean`**, computed in code by checking that the quote really appears on that page (or an adjacent one) of the decision. Show a warning badge when it is `false`.
- `page` is `null` when there is no quote (e.g. unsupported claims, assumptions).
- Citations: to show a quote in context, call `GET /cases/:id/pages/:page` and highlight `quote` inside `text`.
- No endpoint ever returns a probability of winning.
- Errors: `{ "error": "message" }` with status `404` (unknown case/page), `400` (bad input), `500` (server/model failure), `501` (not implemented yet).

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

The association's funding pitch as Markdown. Citations appear as `"quote" (p. N)`.

```json
{ "markdown": "## 1. The case in three sentences\n\nIn October 2024, an attacker ..." }
```

## `GET /cases/:id/scorecard`

Funder view: every pitch claim checked against the decision, plus scores and red flags.

```json
{
  "claims": [
    {
      "claim": "The breach concerns more than 24 million subscriber contracts.",
      "status": "supported",
      "quote": "La violation concerne les données de plus de 24 millions de contrats d'abonnés",
      "page": 3,
      "note": "",
      "quote_verified": true
    },
    {
      "claim": "All 24 million subscribers had their IBAN leaked.",
      "status": "unsupported",
      "quote": "",
      "page": null,
      "note": "The decision says only some contracts contained an IBAN.",
      "quote_verified": false
    }
  ],
  "scores": [
    {
      "criterion": "fault_established",
      "rating": "strong",
      "reason": "The CNIL found breaches of articles 32 and 34; appeal status is unknown.",
      "quote": "Les sociétés n'ont pas mis en œuvre les mesures techniques et organisationnelles appropriées",
      "page": 4,
      "quote_verified": true
    }
  ],
  "red_flags": ["Appeal status before the Conseil d'État is not stated in the decision."],
  "summary": "Two sentences, never a probability of success.",
  "mock": true
}
```

- `status`: `supported` | `overstated` | `unsupported` | `assumption`
- `rating`: `strong` | `medium` | `weak`
- `criterion`: `fault_established`, `data_sensitivity`, `group_size`, `harm_evidence`, `victim_notification_failure`, `defendant`, `recoverability`

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
