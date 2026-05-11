# GeoPulse 🌐

AI visibility audits for local businesses. See how any business shows up in AI-generated search results — and get a prioritized action plan to improve it.

## Stack

- React + Vite (frontend)
- Vercel Edge Functions (API)
- Claude API (Anthropic)

## Local development

```bash
npm install
npm run dev
```

> Note: The `/api/audit` route requires Vercel CLI for local testing with the edge function.
> Install it: `npm i -g vercel` then run `vercel dev` instead of `npm run dev`

## Deploy to Vercel

1. Push this folder to a GitHub repo
2. Import the repo at vercel.com
3. Add your environment variable:
   - `ANTHROPIC_API_KEY` = your Anthropic API key
4. Deploy — done ✅

## Environment variables

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key from console.anthropic.com |

## Project structure

```
geopulse/
├── api/
│   └── audit.js          # Edge function — calls Claude API server-side
├── src/
│   ├── App.jsx            # Main app shell + state management
│   ├── App.module.css
│   ├── index.css          # Global tokens + reset
│   ├── main.jsx
│   └── components/
│       ├── AuditForm.jsx          # Input form
│       ├── AuditForm.module.css
│       ├── AuditResults.jsx       # Dashboard with scores, insights, playbook
│       └── AuditResults.module.css
├── index.html
├── package.json
├── vercel.json
└── vite.config.js
```
