# Quick Start Guide

Get AutoPulse running in **under 5 minutes**.

---

## 1. Prerequisites

- **Bun** ≥ 1.0 — install via `curl -fsSL https://bun.sh/install | bash` (or use npm/pnpm)
- **Node.js** ≥ 20 (only needed if you don't use Bun)
- A **Lovable account** with this project linked to your GitHub repo

---

## 2. Get the code

```bash
git clone https://github.com/<your-org>/guardian-owl-56.git
cd guardian-owl-56
bun install
```

---

## 3. Environment variables

The `.env` file is **auto-generated and managed by Lovable Cloud** — don't edit it.

It already contains:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_SUPABASE_PROJECT_ID=...
```

Server-side secrets (set via **Lovable Cloud → Secrets**, never commit them):

| Secret | Required for |
| --- | --- |
| `LOVABLE_API_KEY` | AI features (auto-provided by Lovable) |
| `BRANCH_DEBUG_TOKEN` | CLI / VS Code Branch Debug endpoint |

---

## 4. Run the dev server

```bash
bun run dev
```

Open <http://localhost:5173> → you'll land on the marketing page.

Click **Sign In** → create an account → you're routed into `/dashboard`.

---

## 5. Try the core flows

### a. Branch Debug (no setup needed)

1. Go to **Dashboard → Branch Debug**.
2. Paste any `git diff` and a one-sentence failure description.
3. Click **Analyze** — you'll get ranked suspects with file/line + sanitization audit.

### b. Forensic analysis

1. Go to **Dashboard → Forensic**.
2. Submit a public URL or upload a file.
3. View the agent pipeline output and severity scoring.

### c. Incidents

1. Go to **Dashboard → Incidents**.
2. Create an incident, run AI analysis, resolve.

---

## 6. Build for production

```bash
bun run build      # bundles for Cloudflare Workers
bun run preview    # smoke-test the build locally
```

To deploy: just push to your default branch — Lovable Cloud handles the deploy. Or click **Publish** in the Lovable editor.

---

## 7. Use Branch Debug from your terminal

```bash
export BRANCH_DEBUG_TOKEN="<from Lovable Cloud secrets>"

git diff main...HEAD | node cli/eventdash-debug.mjs \
  --failure "tests pass locally but fail on CI for EU users"
```

The CLI POSTs to:

```
https://project--bff39f15-1e2d-4d34-8f4b-7070bac6dbae.lovable.app/api/public/branch-debug
```

with `Authorization: Bearer $BRANCH_DEBUG_TOKEN`.

---

## 8. Where to look next

| I want to… | Open |
| --- | --- |
| Add a new page | `src/routes/<name>.tsx` |
| Add backend logic | `src/server/<name>.functions.ts` (use `requireSupabaseAuth`) |
| Change colors / theme | `src/styles.css` (semantic tokens only) |
| Modify the database | Use the Lovable Cloud migration tool — never edit `src/integrations/supabase/types.ts` |
| Add a secret / API key | Lovable Cloud → Secrets |
| Read security guarantees | [`README.md`](./README.md#-security-posture) |

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `LOVABLE_API_KEY not configured` | Open Lovable Cloud → confirm the secret exists; restart dev server |
| 401 from `/api/public/branch-debug` | Set `BRANCH_DEBUG_TOKEN` env var to match the secret in Lovable Cloud |
| Blank dashboard after login | Hard refresh; check browser console — likely a stale auth session |
| Build fails with "Failed to resolve import" | A file/package was referenced before being created/installed — re-run `bun install` |
| Migration fails with `ALTER DATABASE` | Remove that line — not allowed on Lovable Cloud |

---

Need more detail? See the full [README](./README.md). Happy debugging 🦉
