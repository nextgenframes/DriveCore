FROM ollama/ollama:latest

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip3 install --no-cache-dir -r requirements.txt

COPY backend.py ./

ENV OLLAMA_HOST=0.0.0.0:11434
EXPOSE 7860 11434

ENTRYPOINT ["/bin/sh", "-lc"]
CMD ["ollama serve >/tmp/ollama.log 2>&1 & until curl -sf http://127.0.0.1:11434/api/tags >/dev/null; do sleep 2; done; ollama pull qwen3 && uvicorn backend:app --host 0.0.0.0 --port 7860"]