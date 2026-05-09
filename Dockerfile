FROM node:20-slim

RUN npm install -g serve

WORKDIR /app

COPY dist/client ./public

EXPOSE 7860

CMD ["serve", "-l", "7860", "--single", "public"]
