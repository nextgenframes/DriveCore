import subprocess
import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
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

AMD_BACKEND = os.getenv("AI_BASE_URL", "http://165.245.137.74:8006")

class Query(BaseModel):
    input: str

@app.post("/triage")
async def triage(query: Query):
    async with httpx.AsyncClient(timeout=300) as client:
        resp = await client.post(f"{AMD_BACKEND}/triage", json={"input": query.input})
        return resp.json()

@app.post("/branch-debug")
async def branch_debug(query: Query):
    async with httpx.AsyncClient(timeout=300) as client:
        resp = await client.post(f"{AMD_BACKEND}/branch-debug", json={"input": query.input})
        return resp.json()

@app.post("/forensic")
async def forensic(query: Query):
    async with httpx.AsyncClient(timeout=300) as client:
        resp = await client.post(f"{AMD_BACKEND}/forensic", json={"input": query.input})
        return resp.json()

@app.post("/v1/chat/completions")
async def chat_completions(request: dict):
    async with httpx.AsyncClient(timeout=300) as client:
        resp = await client.post(f"{AMD_BACKEND}/v1/chat/completions", json=request)
        return resp.json()

@app.get("/health")
async def health():
    return {"status": "ok", "backend": AMD_BACKEND}

app.mount("/", StaticFiles(directory="dist/client", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860)
