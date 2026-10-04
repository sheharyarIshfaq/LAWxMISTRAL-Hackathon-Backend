# Bina.ai — frontend

The two desks of Bina.ai: CNIL data-breach sanctions turned into fundable collective actions (*action de groupe*). The API is in [`../backend`](../backend/README.md) (endpoints in `API.md`). To run both at once, see the [root README](../README.md).

## Run

Start the backend first (port 3001), then:

```bash
npm install
cp .env.example .env.local   # NEXT_PUBLIC_API_URL=http://localhost:3001
npm run dev -- --port 3000
```

Open [http://localhost:3000](http://localhost:3000).

## Pages

- **`/`** — landing page with a live preview of a funding brief and live figures from the API.
- **`/desk` — association desk**
  - **Decisions:** every CNIL sanction, triaged. Qualified decisions can be worked on.
  - **Cases:**
    - the funding brief (same as the PDF) with a form for the association's own details
    - Finalize, then Send to funders
    - the decision summary, with § links to Légifrance
  - **Funders:** the legal team's list plus web-discovered funders, matched to the case. Select funders and send.
  - **Agent:** questions about the decision. Every quote is checked, each § links to Légifrance, and the steps the backend ran are shown.
- **`/book` — funder desk** (no login; "Signed in as" picker)
  - **Dashboard:** pitches received, total claim value, breakdowns.
  - **Pitches:** each brief with its five scores, the association's message, and the brief itself.
  - **AI:** the same agent, attached to a pitch.

Next.js 16 (App Router), React 19, Tailwind CSS v4. Nothing is stored in the browser except UI conveniences (open tabs, the chosen funder).

## Demo path (≈3 min)

1. Decisions → a qualified decision → **Work on this case**.
2. Cases → open it → fill the association's details → **Finalize the brief** → **Send to funders**.
3. Funders → select two strong matches → **Send brief**.
4. Funder desk → the funder who received it → Dashboard → Pitches → **Ask the AI**: "Were the victims informed?" → the agent quotes § 3 and the § chip opens Légifrance.
5. Ask "What is the chance of winning?" → the agent declines.
