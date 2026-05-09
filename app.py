from fastapi import FastAPI
from fastapi.responses import HTMLResponse
import uvicorn

app = FastAPI()

@app.get("/", response_class=HTMLResponse)
async def index():
    return """
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>DriveCore — AV Safety Intelligence</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #07080f; font-family: sans-serif; height: 100vh; display: flex; flex-direction: column; }
        .bar { padding: 10px 20px; background: #0d0f1a; border-bottom: 1px solid #1e2235; display: flex; align-items: center; gap: 10px; }
        .logo { background: #6366f1; width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 14px; }
        .brand { color: #e2e8f0; font-weight: 700; font-size: 15px; }
        .badge { margin-left: auto; font-size: 10px; background: #131627; border: 1px solid #1e2235; padding: 3px 10px; border-radius: 20px; color: #64748b; }
        iframe { flex: 1; border: none; width: 100%; height: calc(100vh - 50px); }
    </style>
</head>
<body>
    <div class="bar">
        <div class="logo">🚗</div>
        <span class="brand">DriveCore</span>
        <span class="badge">⚡ AMD Instinct GPU + Qwen3 + LangChain</span>
    </div>
    <iframe src="https://drivecore.dr-coke.workers.dev/" allowfullscreen></iframe>
</body>
</html>
"""

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=7860)
