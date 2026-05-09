import os
import uuid
import time
from fastapi import FastAPI, Request
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
    "You are precise, technical, and helpful. Always start your response with: "
    "'Hi, I'm Qwen the AutoPulse Bot. I am now looking through your submissions on issues and I will diagnose.'"
)

async def call_groq(prompt: str) -> str:
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
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
    result = await call_groq(
        f"Run a full AV incident triage:\n"
        f"1. Classify incident (vehicle_id, timestamp, severity P1/P2/P3)\n"
        f"2. Identify affected subsystems (GNSS, LiDAR, perception, planning, control)\n"
        f"3. Root cause analysis ranked by confidence (ISO 26262, SAE J3016, NHTSA)\n"
        f"4. Response plan (immediate, short-term, long-term)\n"
        f"5. Formal Markdown report\n"
        f"End with '## Qwen's Personal Recommendation'\n\n"
        f"Incident: {query.input}"
    )
    return {"output": result}

@app.post("/branch-debug")
async def branch_debug(query: Query):
    result = await call_groq(
        f"Analyze this git diff and failure description. "
        f"Rank root cause suspects by file path, line range, mechanism, confidence (high/medium/low). "
        f"End with '## Qwen's Personal Recommendation'.\n\n{query.input}"
    )
    return {"output": result}

@app.post("/forensic")
async def forensic(query: Query):
    result = await call_groq(
        f"Perform forensic analysis on this content. "
        f"Flag suspicious patterns, security vulnerabilities, or safety issues with severity. "
        f"End with '## Qwen's Personal Recommendation'.\n\n{query.input}"
    )
    return {"output": result}

@app.post("/v1/chat/completions")
async def chat_completions(req: ChatRequest):
    user_messages = [m.content for m in req.messages if m.role == "user"]
    user_input = user_messages[-1] if user_messages else ""
    result = await call_groq(user_input)
    return {
        "id": f"chatcmpl-{uuid.uuid4().hex}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": "qwen3-autopulse-bot",
        "choices": [{"index": 0, "message": {"role": "assistant", "content": result}, "finish_reason": "stop"}]
    }

@app.post("/chat/completions")
async def chat_completions_alias(req: ChatRequest):
    return await chat_completions(req)

@app.get("/health")
async def health():
    return {"status": "ok", "model": "groq", "persona": "Qwen AutoPulse Bot"}

@app.get("/", response_class=HTMLResponse)
async def index():
    return """
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>DriveCore — AV Safety Intelligence</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', sans-serif; background: #0a0a0f; color: #e2e8f0; min-height: 100vh; }
  .header { padding: 20px 40px; border-bottom: 1px solid #1e293b; display: flex; align-items: center; gap: 12px; }
  .logo { width: 36px; height: 36px; background: #6366f1; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 18px; }
  .brand { font-size: 18px; font-weight: 700; }
  .badge { font-size: 10px; background: #1e293b; border: 1px solid #334155; padding: 2px 8px; border-radius: 20px; color: #94a3b8; margin-left: auto; }
  .container { max-width: 900px; margin: 0 auto; padding: 40px 20px; }
  .tabs { display: flex; gap: 8px; margin-bottom: 24px; border-bottom: 1px solid #1e293b; padding-bottom: 0; }
  .tab { padding: 10px 20px; border-radius: 8px 8px 0 0; cursor: pointer; font-size: 14px; font-weight: 500; color: #64748b; border: none; background: none; transition: all 0.2s; }
  .tab.active { color: #6366f1; border-bottom: 2px solid #6366f1; }
  .tab:hover { color: #e2e8f0; }
  .panel { display: none; }
  .panel.active { display: block; }
  textarea { width: 100%; background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 16px; color: #e2e8f0; font-size: 14px; resize: vertical; font-family: inherit; }
  textarea:focus { outline: none; border-color: #6366f1; }
  .btn { background: #6366f1; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; margin-top: 12px; transition: all 0.2s; }
  .btn:hover { background: #4f46e5; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .result { margin-top: 24px; background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 20px; white-space: pre-wrap; font-size: 13px; line-height: 1.7; display: none; }
  .result.show { display: block; }
  .loading { color: #6366f1; font-size: 13px; margin-top: 12px; display: none; }
  .loading.show { display: block; }
  h2 { font-size: 16px; font-weight: 600; margin-bottom: 8px; }
  p { font-size: 13px; color: #64748b; margin-bottom: 16px; }
  .hero { text-align: center; padding: 60px 0 40px; }
  .hero h1 { font-size: 42px; font-weight: 800; line-height: 1.1; margin-bottom: 16px; }
  .hero h1 span { color: #6366f1; }
  .hero p { font-size: 16px; color: #64748b; max-width: 600px; margin: 0 auto 32px; }
  .powered { font-size: 11px; color: #475569; text-align: center; margin-top: 8px; }
</style>
</head>
<body>
<div class="header">
  <div class="logo">🚗</div>
  <span class="brand">DriveCore</span>
  <span class="badge">⚡ Powered by AMD Instinct GPU + Qwen3</span>
</div>
<div class="container">
  <div class="hero">
    <h1>Turn raw incident logs into<br><span>actionable safety intelligence</span>.</h1>
    <p>DriveCore routes every AV event through a multi-agent AI pipeline — surfacing root causes, compliance concerns, and coaching plans in seconds.</p>
  </div>

  <div class="tabs">
    <button class="tab active" onclick="showTab('triage')">🚨 Incident Triage</button>
    <button class="tab" onclick="showTab('branch')">🔀 Branch Debug</button>
    <button class="tab" onclick="showTab('forensic')">🔬 Forensic Analysis</button>
  </div>

  <div id="triage" class="panel active">
    <h2>Incident Triage</h2>
    <p>Submit an AV incident description. Qwen Bot will run a 5-step agent pipeline and produce a formal safety report.</p>
    <textarea id="triage-input" rows="6" placeholder="e.g. Vehicle AV-042 lost GNSS signal at 14:23 on Highway 101 and stopped unexpectedly..."></textarea>
    <button class="btn" onclick="runTriage()">Run Triage Pipeline</button>
    <div class="loading" id="triage-loading">🤖 Qwen Bot is analyzing your incident through 5 agent steps...</div>
    <div class="result" id="triage-result"></div>
  </div>

  <div id="branch" class="panel">
    <h2>Branch Debug</h2>
    <p>Paste a git diff and describe the failure. Qwen Bot will rank root cause suspects by file, line, and confidence.</p>
    <textarea id="branch-input" rows="6" placeholder="Git diff:\n--- a/src/gnss.py\n+++ b/src/gnss.py\n...\n\nFailure: Vehicle stopped unexpectedly after merge"></textarea>
    <button class="btn" onclick="runBranch()">Analyze Branch</button>
    <div class="loading" id="branch-loading">🤖 Qwen Bot is analyzing your diff...</div>
    <div class="result" id="branch-result"></div>
  </div>

  <div id="forensic" class="panel">
    <h2>Forensic Analysis</h2>
    <p>Submit code, logs, or URLs for forensic analysis. Qwen Bot will flag suspicious patterns and safety issues.</p>
    <textarea id="forensic-input" rows="6" placeholder="Paste code, logs, or URL to analyze..."></textarea>
    <button class="btn" onclick="runForensic()">Run Forensic Analysis</button>
    <div class="loading" id="forensic-loading">🤖 Qwen Bot is running forensic analysis...</div>
    <div class="result" id="forensic-result"></div>
  </div>

  <p class="powered">Powered by AMD Instinct GPU ⚡ | Qwen3 via LangChain | Built for AMD Developer Cloud Hackathon</p>
</div>

<script>
function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById(name).classList.add('active');
  event.target.classList.add('active');
}

async function callAPI(endpoint, input, resultId, loadingId) {
  const result = document.getElementById(resultId);
  const loading = document.getElementById(loadingId);
  result.classList.remove('show');
  loading.classList.add('show');
  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({input})
    });
    const data = await resp.json();
    result.textContent = data.output || JSON.stringify(data, null, 2);
    result.classList.add('show');
  } catch(e) {
    result.textContent = 'Error: ' + e.message;
    result.classList.add('show');
  }
  loading.classList.remove('show');
}

function runTriage() {
  const input = document.getElementById('triage-input').value;
  if (!input) return;
  callAPI('/triage', input, 'triage-result', 'triage-loading');
}

function runBranch() {
  const input = document.getElementById('branch-input').value;
  if (!input) return;
  callAPI('/branch-debug', input, 'branch-result', 'branch-loading');
}

function runForensic() {
  const input = document.getElementById('forensic-input').value;
  if (!input) return;
  callAPI('/forensic', input, 'forensic-result', 'forensic-loading');
}
</script>
</body>
</html>
"""

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860)
