---
title: DriveCore
emoji: 🚗
colorFrom: indigo
colorTo: purple
sdk: docker
pinned: false
---

# DriveCore 🚗⚡

**An AI-powered incident response, forensic analysis, and branch debugging platform for autonomous vehicle fleets.**

> Built for the AMD Developer Cloud Hackathon — Track 1: AI Agents & Agentic Workflows
> Powered by **Qwen3** running on **AMD Instinct GPU** via **LangChain** multi-agent pipeline.

---
Quick Start Instructions to Run on AMD GPU Droplet:
1) Start Ollama
ollama serve &

2) Start Qwen backend
cd /app/Autopulse
uvicorn backend:app --host 0.0.0.0 --port 8006 &

3) Start frontend
bun run dev --host 0.0.0.0 --port 30000 &

4) Go to Website
http://165.245.137.74:30000

## What is DriveCore?

DriveCore routes every autonomous vehicle incident, near miss, and sensor log through a multi-step AI agent pipeline — surfacing root causes, compliance concerns, and operator coaching plans in seconds.

## 🤖 AI Agent Pipeline

Step 1: Intake Agent → Classifies incident, extracts vehicle ID, timestamp, severity
Step 2: Enrichment Agent → Identifies affected AV subsystems
Step 3: Risk Agent → Root cause analysis ranked by confidence
Step 4: Response Agent → Immediate actions, short-term fixes, long-term prevention
Step 5: Documentation Agent → Formal Markdown safety report + Qwen's Personal Recommendation

## 🏗 Tech Stack

- AI Model: Qwen3 via Ollama
- Agent Framework: LangChain
- GPU Compute: AMD Instinct MI300X via AMD Developer Cloud
- Backend: FastAPI (Python)
- Frontend: React 19 + TanStack Start + Vite + Tailwind CSS v4

## 🏆 Hackathon

Built for AMD Developer Cloud Hackathon — Track 1: AI Agents & Agentic Workflows

*Powered by AMD Instinct GPU ⚡*
