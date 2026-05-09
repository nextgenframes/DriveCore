FROM node:20-slim
WORKDIR /app
COPY dist/client ./public
COPY server.js .
RUN npm install express
EXPOSE 7860
CMD ["node", "server.js"]
