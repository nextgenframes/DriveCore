from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from langchain_ollama import OllamaLLM
from langchain.prompts import PromptTemplate
from langchain.chains import LLMChain
import time, uuid

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

llm = OllamaLLM(model="qwen3", temperature=0.2)

QWEN_PERSONA = (
    "You are Qwen, the AutoPulse Bot — an expert AI safety analyst for autonomous vehicle fleets, "
    "powered by Qwen3 running on AMD Instinct GPU."
)

def run_chain(system: str, input_text: str) -> str:
    prompt = PromptTemplate.from_template("{system}\n\n{input}")
    chain = LLMChain(llm=llm, prompt=prompt)
    return chain.invoke({"system": system, "input": input_text})["text"]

def step1_intake(description: str) -> str:
    return run_chain(
        f"{QWEN_PERSONA} You are the Intake Agent. Extract and classify this AV incident. "
        f"Return: vehicle_id, timestamp, location, incident_type, initial_severity (P1/P2/P3).",
        f"Incident: {description}"
    )

def step2_enrich(intake: str) -> str:
    return run_chain(
        f"{QWEN_PERSONA} You are the Enrichment Agent. Identify which AV subsystems are affected "
        f"(GNSS, LiDAR, perception, planning, control) and what sensor or software failures may be involved.",
        f"Intake summary: {intake}"
    )

def step3_root_cause(enriched: str) -> str:
    return run_chain(
        f"{QWEN_PERSONA} You are the Risk Agent. Identify the most probable root causes ranked by confidence. "
        f"Reference ISO 26262, SAE J3016, or NHTSA AV Policy where relevant.",
        f"Enriched incident: {enriched}"
    )

def step4_response_plan(root_cause: str) -> str:
    return run_chain(
        f"{QWEN_PERSONA} You are the Safety Response Agent. Generate: "
        f"(1) immediate response actions, (2) short-term fixes, (3) long-term prevention measures.",
        f"Root cause analysis: {root_cause}"
    )

def step5_report(intake: str, enriched: str, root_cause: str, plan: str) -> str:
    return run_chain(
        f"{QWEN_PERSONA} You are the Documentation Agent. "
        f"Start EXACTLY with: 'Hi, I'm Qwen the AutoPulse Bot. I am now looking through your submissions on issues and I will diagnose.'\n\n"
        f"Write a formal incident report in Markdown with sections: "
        f"Executive Summary, Timeline, Affected Subsystems, Root Causes, Compliance Flags, Response Plan, Recommendations.\n\n"
        f"End with '## Qwen's Personal Recommendation' — give your own expert insight based on your Qwen3 knowledge, "
        f"be specific and technical.",
        f"INTAKE:\n{intake}\n\nENRICHED:\n{enriched}\n\nROOT CAUSE:\n{root_cause}\n\nRESPONSE PLAN:\n{plan}"
    )

def full_triage_pipeline(incident: str) -> str:
    print(f"\n[Qwen] Step 1: Intake...")
    intake = step1_intake(incident)
    print(f"[Qwen] Step 2: Enrichment...")
    enriched = step2_enrich(intake)
    print(f"[Qwen] Step 3: Root Cause Analysis...")
    root_cause = step3_root_cause(enriched)
    print(f"[Qwen] Step 4: Response Plan...")
    plan = step4_response_plan(root_cause)
    print(f"[Qwen] Step 5: Writing Report...")
    report = step5_report(intake, enriched, root_cause, plan)
    print(f"[Qwen] Pipeline complete.")
    return report

def branch_debug_pipeline(diff_input: str) -> str:
    print(f"\n[Qwen] Running Branch Debug...")
    return run_chain(
        f"{QWEN_PERSONA} You are the Code Forensics Agent. "
        f"Start with: 'Hi, I'm Qwen the AutoPulse Bot. Analyzing your branch diff now.'\n\n"
        f"Analyze this git diff and failure description. Rank root cause suspects by file path, "
        f"line range, mechanism, and confidence (high/medium/low). "
        f"End with '## Qwen's Personal Recommendation'.",
        diff_input
    )

def forensic_pipeline(content: str) -> str:
    print(f"\n[Qwen] Running Forensic Analysis...")
    return run_chain(
        f"{QWEN_PERSONA} You are the Forensic Analysis Agent. "
        f"Start with: 'Hi, I'm Qwen the AutoPulse Bot. Running forensic analysis now.'\n\n"
        f"Analyze this content for suspicious patterns, security vulnerabilities, or safety issues. "
        f"Flag anomalies with severity. End with '## Qwen's Personal Recommendation'.",
        content
    )

# ── Request models ─────────────────────────────────────────────────

class Query(BaseModel):
    input: str

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    model: str = "qwen3"
    messages: list[ChatMessage]
    tools: list = []
    tool_choice: dict = {}

# ── Endpoints ──────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "model": "qwen3", "agent": "Qwen the AutoPulse Bot", "gpu": "AMD Instinct"}

@app.post("/triage")
def triage(query: Query):
    result = full_triage_pipeline(query.input)
    return {"output": result}

@app.post("/branch-debug")
def branch_debug(query: Query):
    result = branch_debug_pipeline(query.input)
    return {"output": result}

@app.post("/forensic")
def forensic(query: Query):
    result = forensic_pipeline(query.input)
    return {"output": result}

@app.post("/analyze")
def analyze(query: Query):
    result = full_triage_pipeline(query.input)
    return {"output": result}

@app.post("/v1/chat/completions")
def chat_completions(req: ChatRequest):
    user_messages = [m.content for m in req.messages if m.role == "user"]
    user_input = user_messages[-1] if user_messages else ""
    result = full_triage_pipeline(user_input)
    return JSONResponse({
        "id": f"chatcmpl-{uuid.uuid4().hex}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": "qwen3-autopulse-bot",
        "choices": [{
            "index": 0,
            "message": {"role": "assistant", "content": result},
            "finish_reason": "stop"
        }]
    })
