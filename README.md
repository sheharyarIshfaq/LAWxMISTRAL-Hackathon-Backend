# Bina.ai

CNIL data-breach sanctions turned into fundable collective actions (*action de groupe*, French law of 30 April 2025).

A CNIL sanction already establishes the fault, the facts and the number of people affected. Bina.ai:
1. watches the CNIL;
2. summarises each decision with the legal team's method;
3. builds the funding brief an association can send;
4. matches it with litigation funders;
5. lets funders question the decision through an agent that quotes it word for word and shows its reasoning live.

1st place project, built for the LLM × Law hackathon (Mistral, Paris, 2026).

| Folder | What | Port |
| --- | --- | --- |
| [`backend/`](backend/README.md) | Express + TypeScript API, Mistral, JSON data (no database) | 3001 |
| [`frontend/`](frontend/README.md) | Next.js 16 app: association desk and funder desk | 3000 |

## Run on a new machine

Needs **Node 20.9+** (22 recommended, see `.nvmrc`), a **Mistral API key**, and **Google Chrome** (only for downloading the brief as PDF).

```bash
git clone git@github.com:sheharyarIshfaq/bina-ai.git
cd bina-ai
npm install          # installs root, backend and frontend; creates backend/.env and frontend/.env.local
```

Put your key in `backend/.env`:

```
MISTRAL_API_KEY=your-key
```

Then start both apps:

```bash
npm run dev          # API on http://localhost:3001, app on http://localhost:3000
```

Open http://localhost:3000. The association desk is `/desk`, the funder desk is `/book`.

Run one side only with `npm run dev:backend` or `npm run dev:frontend`.

### Troubleshooting

- **"Cannot reach the backend"** in the app: the API isn't running, or isn't on port 3001. Check the `api` lines in the terminal.
- **Port already in use:** stop whatever runs on 3000 or 3001, or set `PORT` in `backend/.env` and `NEXT_PUBLIC_API_URL` in `frontend/.env.local` to match.
- **PDF download fails:** install Google Chrome, or set `CHROME_PATH` in `backend/.env` to a Chrome, Chromium or Edge binary.
- **`MISTRAL_API_KEY is not set`:** the key is missing from `backend/.env`. Restart `npm run dev` after adding it.

Everything else (the three processed CNIL decisions, the funder list, the radar results) is committed under `backend/data/`, so the app works right after cloning.
