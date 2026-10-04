# Bina.ai — backend

Turns CNIL data-breach sanctions into fundable collective actions (*action de groupe*, law of 30 April 2025).

A CNIL sanction already establishes the fault, the facts and the number of people affected. Bina.ai watches the CNIL, summarises each decision with the legal team's method, builds a funding brief an association can send, matches it with litigation funders, and lets funders question the decision through an agent.

Built for the LLM × Law hackathon (Mistral, Paris, 2026). The frontend lives in [`../frontend`](../frontend/README.md). To run both at once, see the [root README](../README.md).

## Trust rules

- **Every fact is traceable.** Each quote is checked word for word against the decision text by code (`src/services/quoteCheck.ts`). The page and paragraph (§) are found by code, never trusted from the model. Each § links to the passage on Légifrance.
- **The model never does arithmetic.** Opt-in rates, claim values (low / base / high) and the five scores come from the legal team's tables and formulas, in code (`config/assumptions.json`, `src/services/recovery.ts`, `src/services/scores.ts`).
- **No probability of winning.** A CNIL sanction is a regulatory breach, not liability in court. Prompts forbid it and a code filter removes any such statement from chat answers.
- **Temperature 0** for every extraction.
- **The legal team's rules are used verbatim** (`prompts/summary.txt`, `identifiability.txt`, `harm-quantified.txt`).

## Run

Requires Node 22+ and Google Chrome (used headless to render the brief PDF).

```bash
npm install
cp .env.example .env      # add your MISTRAL_API_KEY
npm run dev               # http://localhost:3001
```

Then start the frontend (see its README) on port 3000.

| Variable | Default | Purpose |
| --- | --- | --- |
| `MISTRAL_API_KEY` | — | Required. Mistral API key |
| `PORT` | `3001` | API port |
| `APP_URL` | `http://localhost:3000` | Frontend URL used in emails |
| `MONITOR` | on | `off` disables the background CNIL scan |
| `MONITOR_INTERVAL_HOURS` | `6` | Scan interval |
| `CHROME_PATH` | macOS Chrome | Chrome binary for PDF rendering |

No database: everything is JSON under `data/`. Emails are written to `data/outbox/emails.json`, never sent.

## How a case moves

1. **Radar** (`src/services/radar.ts`, `monitor.ts`). Scans the CNIL sanctions list every 6 h, triages breaches by rules, and writes an alert email to the outbox for associations.
2. **Decision → case** (`npm run pages`, `npm run extract`). The PDF text layer (with OCR fallback) becomes `pages.json`, then a structured `case.json` with every fact quoted and checked.
3. **Summary** (`npm run summary`). The legal team's summary prompt, with every citation verified and linked to Légifrance.
4. **Funding brief** (`npm run category`, `assess`, `revenue`, `pitch`, `report`).
   - The category of harm picks a row in the legal team's opt-in table.
   - Victim identifiability and harm quantification follow the legal team's rules.
   - The defendant's net income comes from web search, with sources.
   - The five scores are value, victims, defendant, harm and timeline.
   - The brief is rendered to HTML and PDF.
5. **Association workspace.** The association adds its own details (facts from the decision are locked), finalizes, and sends.
6. **Funder matching** (`src/services/matching.ts`). The legal team's list (`data/funders.csv`) plus web-discovered funders, matched criterion by criterion in code: strong / partial / weak, with unknowns listed "to confirm".
7. **Agent.** Chat over the decision. Quotes are verified, each answer shows the steps the backend ran, and nothing about the chance of winning is ever said.

Cases ready for the demo: `free-mobile-2026`, `hopital-prive-loire-2026`, `france-travail-2026`.

## Layout

```
src/routes/        Express routers
src/controllers/   request handling
src/services/      pipeline, checks, scoring, matching, radar
src/middleware/    CORS, errors
prompts/           model prompts (legal team's rules verbatim)
config/            assumptions (opt-in table, €150/victim, funder share), decision URLs, associations
data/              one folder per case, funders, radar, workspace, outbox
scripts/           pipeline steps and checks (npm run smoke, npm run test-scores)
```

The full endpoint list is in [API.md](API.md).
