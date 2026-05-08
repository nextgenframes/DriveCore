from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from langchain_ollama import OllamaLLM
from langchain.agents import AgentExecutor, create_react_agent
from langchain.tools import tool
from langchain import hub
import time, uuid

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

llm = OllamaLLM(model="qwen3", temperature=0.2)

# ── Tools ──────────────────────────────────────────────────────────

@tool
def intake_incident(description: str) -> str:
    """Step 1: Intake and classify an AV incident. Extract vehicle ID, timestamp, location, and incident type."""
    return llm.invoke(
        f"You are an AV intake agent. Extract and classify this incident. "
        f"Return: vehicle_id, timestamp, location, incident_type, initial_severity (P1/P2/P3).\n\nIncident: {description}"
    )

@tool
def enrich_incident(intake_summary: str) -> str:
    """Step 2: Enrich the incident with AV domain knowledge. Identify affected subsystems (GNSS, LiDAR, perception, planning, control)."""
    return llm.invoke(
        f"You are an AV enrichment agent. Given this intake summary, identify which AV subsystems are affected "
        f"and what sensor or software failures may be involved.\n\nIntake: {intake_summary}"
    )

@tool
def analyze_root_cause(enriched_summary: str) -> str:
    """Step 3: Perform root cause analysis on an enriched AV incident summary."""
    return llm.invoke(
        f"You are an AV root cause analysis agent. Analyze the enriched incident and identify "
        f"the most probable root causes ranked by confidence. Reference ISO 26262, SAE J3016, or NHTSA AV Policy where relevant.\n\nEnriched summary: {enriched_summary}"
    )

@tool
def generate_response_plan(root_cause_analysis: str) -> str:
    """Step 4: Generate a recommended response and remediation plan based on root cause analysis."""
    return llm.invoke(
        f"You are an AV safety response agent. Based on this root cause analysis, generate: "
        f"(1) immediate response actions, (2) short-term fixes, (3) long-term prevention measures.\n\nAnalysis: {root_cause_analysis}"
    )

@tool
def write_incident_report(full_analysis: str) -> str:
    """Writes a formal AV incident report in Markdown format with Qwen personality."""
    return llm.invoke(
        f"You are Qwen, the AutoPulse Bot. Start your report EXACTLY with this greeting:\n"
        f"'Hi, I'm Qwen the AutoPulse Bot. I am now looking through your submissions on issues and I will diagnose.'\n\n"
        f"Then write a formal incident report in Markdown with sections: "
        f"Executive Summary, Timeline, Affected Subsystems, Root Causes, Compliance Flags, Response Plan, Recommendations.\n\n"
        f"At the very end, add a section called '## Qwen's Personal Recommendation' where you give your own "
        f"expert suggestion based on your knowledge of AV systems, drawing from your own reasoning — "
        f"not just repeating the analysis above. Be specific, technical, and insightful.\n\n"
        f"Analysis to report on: {full_analysis}"
    )

@tool
def analyze_branch_diff(diff_and_failure: str) -> str:
    """Analyzes a git diff and failure description to rank root cause suspects by file, line, and confidence."""
    return llm.invoke(
        f"You are a code forensics agent. Analyze this git diff and failure description. "
        f"Rank root cause suspects by file path, line range, mechanism, and confidence (high/medium/low).\n\n{diff_and_failure}"
    )

@tool
def forensic_url_analysis(url_or_content: str) -> str:
    """Performs forensic analysis on a URL or file content for security and safety issues."""
    return llm.invoke(
        f"You are a forensic analysis agent. Analyze this content for suspicious patterns, "
        f"security vulnerabilities, or safety issues. Flag anomalies with severity.\n\nContent: {url_or_content}"
    )

# ── Agent setup ────────────────────────────────────────────────────

tools = [
    intake_incident,
    enrich_incident,
    analyze_root_cause,
    generate_response_plan,
    write_incident_report,
    analyze_branch_diff,
    forensic_url_analysis,
]

prompt = hub.pull("hwchase17/react")
agent = create_react_agent(llm, tools, prompt)
agent_executor = AgentExecutor(
    agent=agent,
    tools=tools,
    verbose=True,
    handle_parsing_errors=True,
    max_iterations=8,
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
    return {"status": "ok", "model": "qwen3", "agent": "multi-step"}

@app.post("/triage")
def triage(query: Query):
    """Full 5-step agentic triage pipeline."""
    result = agent_executor.invoke({
        "input": (
            f"Run the full AV incident triage pipeline for this incident: {query.input}\n\n"
            f"Steps: (1) intake_incident, (2) enrich_incident, (3) analyze_root_cause, "
            f"(4) generate_response_plan, (5) write_incident_report. "
            f"Pass the output of each step into the next."
        )
    })
    return {"output": result["output"]}

@app.post("/branch-debug")
def branch_debug(query: Query):
    """Agentic branch diff root cause analysis."""
    result = agent_executor.invoke({
        "input": f"Use analyze_branch_diff to find root causes in this diff and failure: {query.input}"
    })
    return {"output": result["output"]}

@app.post("/forensic")
def forensic(query: Query):
    """Agentic forensic analysis."""
    result = agent_executor.invoke({
        "input": f"Use forensic_url_analysis to analyze this content for issues: {query.input}"
    })
    return {"output": result["output"]}

@app.post("/analyze")
def analyze(query: Query):
    """General agentic analysis endpoint."""
    result = agent_executor.invoke({"input": query.input})
    return {"output": result["output"]}

@app.post("/v1/chat/completions")
def chat_completions(req: ChatRequest):
    """OpenAI-compatible endpoint — routes through full agent pipeline."""
    user_messages = [m.content for m in req.messages if m.role == "user"]
    user_input = user_messages[-1] if user_messages else ""

    result = agent_executor.invoke({
        "input": (
            f"Run the full AV incident triage pipeline: "
            f"(1) intake_incident, (2) enrich_incident, (3) analyze_root_cause, "
            f"(4) generate_response_plan, (5) write_incident_report. "
            f"Input: {user_input}"
        )
    })

    return JSONResponse({
        "id": f"chatcmpl-{uuid.uuid4().hex}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": req.model,
        "choices": [{
            "index": 0,
            "message": {"role": "assistant", "content": result["output"]},
            "finish_reason": "stop"
        }]
    })
