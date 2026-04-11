# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Production stage ─────────────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/build ./build

# Persistent data directory — mount a Railway volume here
RUN mkdir -p /data
ENV NODE_ENV=production
ENV PERSIST_DIR=/data
EXPOSE 3000

CMD ["node", "build/index.js"]
