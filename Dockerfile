FROM python:3.11-slim

RUN apt-get update && apt-get install -y curl nodejs npm && \
    npm install -g bun && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy everything
COPY . .

# Build frontend
RUN bun install && bun run build

# Install static file server
RUN pip install aiofiles

EXPOSE 7860

CMD ["python", "app.py"]
