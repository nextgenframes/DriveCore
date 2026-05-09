FROM node:20-slim

RUN npm install -g bun serve

WORKDIR /app

COPY package.json ./
RUN bun install

COPY . .

ENV AI_BASE_URL=http://165.245.137.74:8006
ENV AI_API_KEY=dummy
ENV AI_MODEL=qwen3

RUN bun run build

WORKDIR /app/dist/client

EXPOSE 7860

CMD ["serve", "-l", "7860", "--single", "."]
