# DriveCore Debugging Tool

An AI-powered incident response, forensic analysis, and branch debugging platform.

DriveCore Debugging Tool helps engineering and security teams:

- **Triage incidents** with an AI agent pipeline (intake → enrichment → analysis → response).
- **Run forensic analysis** on suspicious URLs and uploaded files with built-in SSRF protection.
- **Debug failing branches** by feeding a git diff (or raw snippet) + failure description and getting ranked root-cause suspects — with an IP Shield that strips secrets and tokenizes identifiers before anything leaves your machine.
- **Track compliance, coaching, and reports** from a single dashboard.

---

## ✨ Features

| Module                              | What it does                                                                                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Incidents**                       | Create, analyze, and resolve incidents. AI agent enriches each event with severity, recommended actions, and an audit trail.                                       |
| **Forensic**                        | Submit URLs/files for automated forensic analysis. Public-URL inputs are guarded against SSRF (loopback, RFC1918, link-local, cloud metadata IPs blocked).         |
| **Branch Debug**                    | Paste a git diff or code snippet + failure description → get ranked suspects with file path, line range, mechanism, and confidence. Includes a sanitization audit. |
| **Coaching / Compliance / Reports** | Workflow surfaces for review, learnings, and exportable reports.                                                                                                   |
| **CLI / VS Code Extension**         | Hit the same Branch Debug analyzer from your terminal or editor via a token-protected public endpoint.                                                             |

---

## 🏗 Tech stack

- **Framework**: [TanStack Start](https://tanstack.com/start) (React 19 + Vite 7, SSR on Cloudflare Workers)
- **Styling**: Tailwind CSS v4 + shadcn/ui + semantic design tokens
- **Backend**: Lovable Cloud (managed Postgres, Auth, Storage, Edge Functions)
- **AI**: Lovable AI Gateway (Gemini 2.5 Flash by default — no API key required)
- **Routing**: File-based routes under `src/routes/`
- **Server logic**: `createServerFn` handlers under `src/server/`

---

## 🚀 Quick Start

### 1. Prerequisites

- [Bun](https://bun.sh) ≥ 1.0 (or npm/pnpm)
- A Lovable account with this project synced to your GitHub

### 2. Clone and install

```bash
git clone https://github.com/<your-org>/guardian-owl-56.git
cd guardian-owl-56
bun install
```

### 3. Environment

The `.env` file is **auto-managed by Lovable Cloud** and already contains:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_SUPABASE_PROJECT_ID=...
```

Do **not** edit it manually. Server-side secrets (set via Lovable Cloud → Secrets):

| Secret               | Purpose                                                           |
| -------------------- | ----------------------------------------------------------------- |
| `LOVABLE_API_KEY`    | AI Gateway access (auto-provided)                                 |
| `BRANCH_DEBUG_TOKEN` | Bearer token for the public Branch Debug endpoint (CLI / VS Code) |

### 4. Run locally

```bash
bun run dev
```

Open <http://localhost:5173>. Sign up / log in — the dashboard requires an authenticated session.

### 5. Build

```bash
bun run build      # production build (Cloudflare Worker bundle)
bun run preview    # preview the build locally
```

---

## 🔐 Security posture

This app ships with several hardening layers — keep them in place:

- **Auth on every server function** via `requireSupabaseAuth` middleware (`src/integrations/supabase/auth-middleware.ts`).
- **Row-level data ownership** — incident analysis checks `user_id` against the authenticated session.
- **SSRF guard** in the forensic pipeline (blocks loopback, private, link-local, and metadata IPs).
- **Public API hardening** — `/api/public/branch-debug` requires `Authorization: Bearer $BRANCH_DEBUG_TOKEN`, enforces CORS, and caps payloads at 256 KB.
- **XSS-safe rendering** — code snippets in the audit modal are HTML-escaped before highlighting.
- **Storage RLS** — `incident-files` bucket policies restrict users to their own folders.
- **`SECURITY DEFINER` functions** — execute revoked from `anon` and `authenticated`; called only from trusted server contexts.
- **IP Shield** — Branch Debug strips secrets (API keys, JWTs, `sk-…`), removes comments, and tokenizes identifiers (`fn_0001`) before sending anything to the AI gateway. Real names are restored only on the response.

When adding new server functions, **always** attach `.middleware([requireSupabaseAuth])` unless the route is intentionally public — and if it is public, document why and add a token check.

---

## 🧰 Branch Debug from CLI / VS Code

A token-protected public endpoint is exposed at:

```
POST https://project--bff39f15-1e2d-4d34-8f4b-7070bac6dbae.lovable.app/api/public/branch-debug
Authorization: Bearer $BRANCH_DEBUG_TOKEN
Content-Type: application/json

{
  "diff": "<unified git diff>",
  "failureDescription": "what broke and how"
}
```

A reference CLI lives in [`cli/eventdash-debug.mjs`](./cli/eventdash-debug.mjs). Typical use:

```bash
git diff main...HEAD | \
  BRANCH_DEBUG_TOKEN=xxxx \
  node cli/eventdash-debug.mjs --failure "checkout returns 500 on EU customers"
```

---

## 📁 Project structure

```
src/
├── routes/                    # File-based routes (TanStack Start)
│   ├── __root.tsx             # Root shell + providers
│   ├── index.tsx              # Landing page
│   ├── auth.tsx               # Sign in / sign up
│   ├── dashboard.tsx          # Authenticated layout (sidebar + Outlet)
│   ├── dashboard.index.tsx    # Dashboard home
│   ├── dashboard.forensic.tsx
│   ├── dashboard.branch-debug.tsx
│   ├── dashboard.coaching.tsx
│   ├── dashboard.compliance.tsx
│   ├── dashboard.reports.tsx
│   └── api/public/            # Public/webhook endpoints
├── server/                    # createServerFn handlers (auth-gated)
│   ├── incidents.functions.ts
│   ├── forensic.functions.ts
│   └── branch-debug.functions.ts
├── components/                # UI + feature components
├── integrations/supabase/     # Auto-generated client + middleware
└── styles.css                 # Tailwind v4 + design tokens

supabase/
├── config.toml                # Cloud config (do not edit project_id)
└── migrations/                # SQL migrations
```

---

## 🧪 Common tasks

| Task                  | Command / location                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| Add a route           | Create `src/routes/<name>.tsx` — auto-registered                                                     |
| Add a server function | Create `src/server/<name>.functions.ts` with `createServerFn(...).middleware([requireSupabaseAuth])` |
| DB schema change      | Use the Lovable Cloud migration tool — never edit `supabase/types.ts` manually                       |
| Add a secret          | Lovable Cloud → Secrets (or ask the AI agent)                                                        |
| Theme tweak           | `src/styles.css` — extend semantic tokens, not raw Tailwind colors                                   |

---

## 🤝 Working with Lovable + GitHub

This repo is **bidirectionally synced** with the Lovable editor:

- Edits in Lovable → auto-pushed to GitHub.
- Pushes to GitHub → auto-pulled into Lovable.

So you can code locally, in your IDE, or in the Lovable chat — whichever fits the moment. Open the project at <https://lovable.dev/projects/bff39f15-1e2d-4d34-8f4b-7070bac6dbae>.

---

## 📜 License

Proprietary — internal use only unless otherwise specified.
