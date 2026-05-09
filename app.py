import os
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
MODEL = "llama-3.3-70b-versatile"

QWEN_PERSONA = (
    "You are Qwen, the AutoPulse Bot — an expert AI safety analyst for autonomous vehicle fleets. "
    "You are precise, technical, and helpful."
)

async def call_groq(prompt: str) -> str:
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            GROQ_URL,
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "model": MODEL,
                "messages": [
                    {"role": "system", "content": QWEN_PERSONA},
                    {"role": "user", "content": prompt}
                ],
                "max_tokens": 2000
            }
        )
        data = resp.json()
        return data["choices"][0]["message"]["content"]

async def full_triage_pipeline(incident: str) -> str:
    intake = await call_groq(f"Intake and classify this AV incident. Extract vehicle_id, timestamp, location, incident_type, severity (P1/P2/P3):\n{incident}")
    enriched = await call_groq(f"Identify affected AV subsystems (GNSS, LiDAR, perception, planning, control):\n{intake}")
    root_cause = await call_groq(f"Analyze root causes ranked by confidence. Reference ISO 26262, SAE J3016, NHTSA:\n{enriched}")
    plan = await call_groq(f"Generate response plan: immediate actions, short-term fixes, long-term prevention:\n{root_cause}")
    report = await call_groq(
        f"Start with: 'Hi, I'm Qwen the AutoPulse Bot. I am now looking through your submissions on issues and I will diagnose.'\n\n"
        f"Write a formal AV incident report in Markdown with sections: Executive Summary, Timeline, Affected Subsystems, Root Causes, Compliance Flags, Response Plan, Recommendations.\n\n"
        f"End with '## Qwen's Personal Recommendation' with expert insight.\n\n"
        f"Intake: {intake}\nRoot Cause: {root_cause}\nPlan: {plan}"
    )
    return report

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

@app.post("/triage")
async def triage(query: Query):
    result = await full_triage_pipeline(query.input)
    return {"output": result}

@app.post("/branch-debug")
async def branch_debug(query: Query):
    result = await call_groq(
        f"You are Qwen the AutoPulse Bot. Start with: 'Hi, I'm Qwen the AutoPulse Bot. Analyzing your branch diff now.'\n\n"
        f"Analyze this git diff and failure. Rank root cause suspects by file, line, confidence.\n\nEnd with '## Qwen's Personal Recommendation'.\n\n{query.input}"
    )
    return {"output": result}

@app.post("/forensic")
async def forensic(query: Query):
    result = await call_groq(
        f"You are Qwen the AutoPulse Bot. Start with: 'Hi, I'm Qwen the AutoPulse Bot. Running forensic analysis now.'\n\n"
        f"Analyze this content for suspicious patterns, security vulnerabilities, or safety issues.\n\nEnd with '## Qwen's Personal Recommendation'.\n\n{query.input}"
    )
    return {"output": result}

@app.post("/v1/chat/completions")
async def chat_completions(req: ChatRequest):
    user_messages = [m.content for m in req.messages if m.role == "user"]
    user_input = user_messages[-1] if user_messages else ""
    result = await full_triage_pipeline(user_input)
    import time, uuid
    return {
        "id": f"chatcmpl-{uuid.uuid4().hex}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": "qwen3-autopulse-bot",
        "choices": [{
            "index": 0,
            "message": {"role": "assistant", "content": result},
            "finish_reason": "stop"
        }]
    }

@app.post("/chat/completions")
async def chat_completions_alias(req: ChatRequest):
    return await chat_completions(req)

@app.get("/health")
async def health():
    return {"status": "ok", "model": "groq-llama3.3-70b", "persona": "Qwen AutoPulse Bot"}

@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    import os
    static_path = f"dist/client/{full_path}"
    if os.path.isfile(static_path):
        from fastapi.responses import FileResponse
        return FileResponse(static_path)
    index_path = "dist/client/index.html"
    if os.path.isfile(index_path):
        from fastapi.responses import FileResponse
        return FileResponse(index_path)
    return HTMLResponse("<h1>DriveCore - Loading...</h1>")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860)
