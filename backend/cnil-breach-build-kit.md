# CNIL data-breach class action platform: build kit

Scope: CNIL data-breach sanction decisions only. Three preloaded decisions (Free, Dedalus Biologie, France Travail). Radar comes later.

The code is untested and written from memory of the Mistral SDK. Check method names against docs.mistral.ai before relying on it. Legal rules in the prompts must be confirmed by your legal teammates.

---

## 1. Pipeline

```
PDF of decision
  -> OCR (markdown per page)
  -> EXTRACT  -> case.json        (one call, strict JSON)
  -> PITCH    -> pitch.md         (NGO view)
  -> VERIFY   -> scorecard.json   (funder view: claims checked against decision + scoring)
  -> CHAT     -> answers with quotes (NGO and funder)
```

Store per case: `decision_pages[]` (page number + text), `case.json`, `pitch.md`, `scorecard.json`.
Keep page numbers everywhere. Citations are what the jury will look for.

---

## 2. Case schema (case.json)

```json
{
  "case_id": "free-2026",
  "decision": {
    "regulator": "CNIL",
    "reference": "",
    "date": "",
    "fine_total_eur": 0,
    "fines": [{"entity": "", "amount_eur": 0}],
    "under_appeal": null,
    "source_url": ""
  },
  "defendant": {
    "name": "",
    "legal_form": "private | public",
    "sector": "",
    "annual_revenue_eur": null
  },
  "breach": {
    "date_start": "",
    "date_discovered": "",
    "summary": "",
    "attack_vector": "",
    "data_types": ["identity", "contact", "iban", "health", "password", "other"],
    "sensitive_data": false,
    "people_affected": 0,
    "people_affected_unit": "persons | contracts | accounts",
    "quote": "",
    "page": 0
  },
  "violations": [
    {
      "gdpr_article": "32",
      "label": "security of processing",
      "finding": "",
      "quote": "",
      "page": 0
    }
  ],
  "victim_notification": {
    "notified": null,
    "adequate": null,
    "quote": "",
    "page": 0
  },
  "harm_evidence": {
    "complaints_count": null,
    "fraud_or_phishing_reported": null,
    "data_published_or_sold": null,
    "quote": "",
    "page": 0
  },
  "missing_information": []
}
```

Rule for the model: every `quote` is copied word for word from the decision, in French, with its page. If a fact is not in the decision, set it to null and add it to `missing_information`. Never guess.

---

## 3. Prompts

### 3.1 EXTRACT (system)

```
You are a legal analyst extracting facts from a French CNIL sanction decision about a personal data breach.

Return only JSON matching the schema provided.

Rules:
- Use only what is written in the decision. Do not use outside knowledge.
- Every "quote" must be copied verbatim from the decision, in French, max 40 words, with the page number it appears on.
- If a field is not stated in the decision, use null and add the field name to "missing_information".
- Amounts in euros as integers. Dates as YYYY-MM-DD; if only month/year is given, use the first day and say so in missing_information.
- "people_affected": use the number the CNIL states and set the unit exactly as the CNIL expresses it (persons, contracts, accounts).
- List each GDPR article the CNIL found breached as a separate item in "violations". Do not list articles the CNIL examined and rejected.
- "legal_form": "public" if the defendant is a public body or administration, otherwise "private".
```

User message: the decision text, each page prefixed with `[PAGE n]`.

### 3.2 PITCH (system)

```
You write a funding pitch for a French association considering a class action (action de groupe) for compensation after a CNIL data-breach sanction.

Input: a case JSON extracted from the CNIL decision. Use only facts from that JSON. Write in English. (Switch to French if the reader is French-speaking.)

Structure, in this order, under these headings:
1. The case in three sentences: who, what happened, how many people.
2. What the CNIL established: one bullet per violation, each ending with the quote and (p. N).
3. The group: who would qualify to join, and the size stated by the CNIL.
4. The harm: types of data leaked and what that exposes victims to. State clearly that individual harm must still be proven in court.
5. Estimated recovery: show the formula
   people affected x opt-in rate x compensation per person
   with three scenarios (low, mid, high). Label every input as an assumption.
6. Risks: appeal pending, opt-in uncertainty, low individual harm, defendant type, anything in missing_information.
7. Compliance statement: the association keeps full control of the action; the funder has no influence over starting or conducting it; funder identity and key contract terms will be disclosed publicly.

Rules:
- No claim without a quote and page from the JSON, except items explicitly labelled "assumption".
- Never state or imply a probability of winning.
- A CNIL sanction establishes a regulatory breach. Do not write that liability in court is certain.
- Max 500 words.
```

Default assumptions to pass in (let legal teammates set these):
`opt_in_rate`: low 0.5%, mid 2%, high 5%
`compensation_per_person_eur`: by data type, e.g. contact only 50 / IBAN 150 / health 500 (placeholders, not legal figures)

### 3.3 VERIFY + SCORE (system) - funder view

```
You are an analyst for a litigation funder. You receive (a) a pitch written for an association and (b) the full text of the CNIL decision it is based on.

Step 1 - verify. Split the pitch into individual factual claims. For each claim, check it against the decision only:
- "supported": the decision says this. Give the quote and page.
- "overstated": the decision says something weaker or different. Give the quote and explain the gap in one sentence.
- "unsupported": not in the decision.
- "assumption": the pitch labels it as an assumption. Do not verify, just list it.

Step 2 - score. Rate each criterion "strong", "medium" or "weak" with a one-sentence reason and a quote where one exists:
- fault_established: violations found by the CNIL, especially article 32; weaker if under appeal or unknown.
- data_sensitivity: IBAN, health, passwords = strong; identity and contact only = weak.
- group_size: number affected.
- harm_evidence: complaints, fraud, publication or sale of the data.
- victim_notification_failure: an article 34 finding strengthens the case.
- defendant: private company able to pay = strong; public body = weak, and flag that the route and court differ.
- recoverability: the pitch's own scenarios; flag any assumption that looks aggressive.

Step 3 - red flags: list anything a funder must check before committing (appeal status, limitation period, standing of the association, missing information).

Return JSON:
{
  "claims": [{"claim": "", "status": "", "quote": "", "page": 0, "note": ""}],
  "scores": [{"criterion": "", "rating": "", "reason": "", "quote": "", "page": 0}],
  "red_flags": [""],
  "summary": "two sentences, no probability of success"
}

Rules: use only the decision text for verification. Never output a win probability or an overall percentage.
```

### 3.4 CHAT (system)

```
You answer questions about one CNIL sanction decision for an association or a litigation funder.

- Answer only from the decision text provided below. If the answer is not in it, say so.
- After each factual sentence, give the supporting quote in French and the page, as: "..." (p. N).
- You may explain general class action procedure in plain language, but mark it clearly as general information, not advice on this case, and tell the user to confirm with a lawyer.
- Never estimate the chance of winning.
- Reply in the language of the question.

DECISION:
{decision_text_with_page_markers}
```

---

## 4. Code sketch (Python)

```python
import json, os
from mistralai import Mistral

client = Mistral(api_key=os.environ["MISTRAL_API_KEY"])
CHAT_MODEL = "mistral-medium-3.5-26.04"   # check current name in docs

def ocr_pdf(url: str) -> list[dict]:
    """Return [{'page': 1, 'text': '...'}, ...]. Check OCR model name in docs."""
    res = client.ocr.process(
        model="mistral-ocr-latest",
        document={"type": "document_url", "document_url": url},
    )
    return [{"page": i + 1, "text": p.markdown} for i, p in enumerate(res.pages)]

def with_markers(pages: list[dict]) -> str:
    return "\n\n".join(f"[PAGE {p['page']}]\n{p['text']}" for p in pages)

def ask_json(system: str, user: str) -> dict:
    res = client.chat.complete(
        model=CHAT_MODEL,
        temperature=0,
        response_format={"type": "json_object"},
        messages=[{"role": "system", "content": system},
                  {"role": "user", "content": user}],
    )
    return json.loads(res.choices[0].message.content)

def ask_text(system: str, user: str) -> str:
    res = client.chat.complete(
        model=CHAT_MODEL,
        temperature=0.2,
        messages=[{"role": "system", "content": system},
                  {"role": "user", "content": user}],
    )
    return res.choices[0].message.content

def run_case(pdf_url: str, schema: dict, assumptions: dict) -> dict:
    pages = ocr_pdf(pdf_url)
    text = with_markers(pages)
    case = ask_json(EXTRACT_PROMPT + "\n\nSCHEMA:\n" + json.dumps(schema), text)
    pitch = ask_text(PITCH_PROMPT, json.dumps({"case": case, "assumptions": assumptions}))
    scorecard = ask_json(VERIFY_PROMPT, f"PITCH:\n{pitch}\n\nDECISION:\n{text}")
    return {"pages": pages, "case": case, "pitch": pitch, "scorecard": scorecard}
```

For local PDFs, upload the file first or send it base64-encoded; see the OCR page in the Mistral docs.

Cheap quote check, worth adding because it catches invented citations:

```python
def quote_ok(quote: str, pages: list[dict], page: int) -> bool:
    norm = lambda s: " ".join(s.lower().split())
    target = norm(quote)
    return any(target in norm(p["text"]) for p in pages if abs(p["page"] - page) <= 1)
```

Run it on every quote in `case` and `scorecard`; show a warning badge in the UI when it fails.

---

## 5. Recovery calculation (do this in code, not in the model)

```python
def recovery(people: int, opt_in: float, per_person: float, funder_share: float = 0.30) -> dict:
    gross = people * opt_in * per_person
    return {"gross": gross, "funder": gross * funder_share, "victims": gross * (1 - funder_share)}
```

Sliders in the funder view: opt-in rate, compensation per person, funder share. All three are assumptions; label them so.

---

## 6. Screens

1. **Cases** - cards for the three preloaded decisions: defendant, date, fine, people affected, data types.
2. **Pitch (association)** - the pitch with clickable citations that open the decision at that page; chat panel on the right.
3. **Funder check** - claims table (supported / overstated / unsupported), scorecard, red flags, recovery sliders.

## 7. Expected contrast between the three cases

| Case | Expected result | Why |
| --- | --- | --- |
| Free | Strongest | Private company, IBANs, 24 million contracts, notification failure |
| Dedalus Biologie | Medium | Health data, but a much smaller group and an older decision (check limitation) |
| France Travail | Weakest for a funder | Public body: different route and court |

Have the legal teammates confirm this ordering before you present it.
