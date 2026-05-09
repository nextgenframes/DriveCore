# DriveCore 🚗⚡

**An AI-powered incident response, forensic analysis, and branch debugging platform for autonomous vehicle fleets.**

> Built for the AMD Developer Cloud Hackathon — Track 1: AI Agents & Agentic Workflows
> Powered by **Qwen3** running on **AMD Instinct GPU** via **LangChain** multi-agent pipeline.

---
Quick Start Instructions to Run on AMD GPU Droplet:
1) # Start Ollama
ollama serve &

2) # Start Qwen backend
# Go into Docker container first
cd /app/Autopulse
uvicorn backend:app --host 0.0.0.0 --port 8006 &

3) # Start frontend
bun run dev --host 0.0.0.0 --port 30000 &

4) #Go to Website
http://165.245.137.74:30000


## What is DriveCore?

DriveCore routes every autonomous vehicle incident, near miss, and sensor log through a multi-step AI agent pipeline — surfacing root causes, compliance concerns, and operator coaching plans in seconds.

When an AV has an incident (GNSS failure, unexpected stop, software regression), engineers spend hours manually triaging logs and writing reports. DriveCore automates that entire workflow using a 5-step LangChain agent pipeline powered by Qwen3 on AMD GPU.

---

## ✨ Features

| Module | What it does |
|---|---|
| **Incident Analysis** | Submit text or file-based incident reports. Five AI agents intake, enrich, analyze root causes, generate response plans, and draft formal safety reports. |
| **Branch Debug** | Paste a git diff or code snippet + failure description → get ranked root-cause suspects with file path, line range, confidence, and mechanism. IP Shield strips secrets before anything reaches the AI. |
| **Forensic Debrief** | Three-stage post-deployment forensic pipeline: code-only hypotheses → log correlation → full ROS bag / sensor data trace. |
| **Compliance Concerns** | Aggregated view of all compliance flags across incidents, referenced to AV standards (NHTSA AV Policy, ISO 26262, SAE J3016, FMVSS, UN R157). |
| **Coaching Recommendations** | Operator and engineer action items surfaced from all completed analyses. |
| **Safety Reports** | Browse and export completed incident analyses as Markdown reports. |

---

## 🤖 AI Agent Pipeline

DriveCore uses a **5-step LangChain agentic workflow** powered by **Qwen3 on AMD Instinct GPU**:

```
Step 1: Intake Agent        → Classifies incident, extracts vehicle ID, timestamp, severity (P1/P2/P3)
Step 2: Enrichment Agent    → Identifies affected AV subsystems (GNSS, LiDAR, perception, planning, control)
Step 3: Risk Agent          → Root cause analysis ranked by confidence (ISO 26262, SAE J3016, NHTSA)
Step 4: Response Agent      → Immediate actions, short-term fixes, long-term prevention measures
Step 5: Documentation Agent → Formal Markdown safety report + Qwen's Personal Recommendation
```

Each step feeds into the next, forming a genuine multi-agent reasoning chain — not just a single LLM call.

---

## 🏗 Tech Stack

| Layer | Technology |
|---|---|
| **AI Model** | Qwen3 (open-source) via Ollama |
| **Agent Framework** | LangChain (multi-step agentic pipeline) |
| **GPU Compute** | AMD Instinct MI300X via AMD Developer Cloud |
| **Backend** | FastAPI (Python), OpenAI-compatible API |
| **Frontend** | React 19 + TanStack Start + Vite + Tailwind CSS v4 |
| **Database** | Supabase (Postgres + Auth) |
| **Deployment** | AMD Developer Cloud (GPU backend) |

---

## 🚀 Quick Start

### Prerequisites
- AMD Developer Cloud account with GPU droplet
- Docker
- Ollama
- Bun ≥ 1.0

### 1. Clone the repo
```bash
git clone https://github.com/nextgenframes/DriveCore.git
cd DriveCore
```

### 2. Install dependencies
```bash
bun install
```

### 3. Set up environment variables
```bash
cp .env.example .env
```

Edit `.env`:
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
AI_BASE_URL=http://your_amd_gpu_ip:8006
AI_API_KEY=dummy
AI_MODEL=qwen3
```

### 4. Start the Qwen3 backend on AMD GPU
```bash
# Inside your AMD GPU container
ollama serve &
ollama pull qwen3
pip install langchain langchain-ollama fastapi uvicorn
uvicorn backend:app --host 0.0.0.0 --port 8006 &
```

### 5. Run the frontend
```bash
bun run dev --host 0.0.0.0 --port 30000
```

---

## 🔌 API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Health check — confirms Qwen3 is running |
| `/triage` | POST | Full 5-step agentic incident triage pipeline |
| `/branch-debug` | POST | Git diff root cause analysis |
| `/forensic` | POST | Forensic content analysis |
| `/v1/chat/completions` | POST | OpenAI-compatible endpoint |

---

## 🔐 Security

- **IP Shield** — Branch Debug strips API keys, JWTs, and secrets before sending to AI
- **SSRF Guard** — Forensic pipeline blocks loopback, private, and cloud metadata IPs
- **Auth** — Supabase authentication with row-level security

---

## 🏆 Hackathon

Built for **AMD Developer Cloud Hackathon — Track 1: AI Agents & Agentic Workflows**

- ✅ LangChain multi-step agentic pipeline
- ✅ Qwen3 open-source model
- ✅ Running on AMD Instinct GPU via AMD Developer Cloud
- ✅ Real AV safety use case (incident triage, branch debug, forensic analysis)
- ✅ OpenAI-compatible API

---

## 📜 License

Proprietary — internal use only unless otherwise specified.

---

*Powered by AMD Instinct GPU ⚡*
