FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.js server.js ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY docs ./docs
COPY README.md LICENSE ./

RUN npm run build

ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0

EXPOSE 8080

CMD ["node", "server.js"]
