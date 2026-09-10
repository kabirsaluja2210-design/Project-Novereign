# Single image, two runtime targets: `web` (Next.js) and `worker` (the
# generation pipeline consumer). Build each with `--target web` /
# `--target worker`. See DEPLOYMENT.md for how to run them together.
#
# No native npm addons are used in this project (bcryptjs is pure JS,
# ioredis is pure JS), so a single node:20-slim image works for both build
# and runtime - no cross-compilation or multi-arch native binary concerns.

FROM node:20-slim AS base
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ---- web ----
FROM base AS web
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "run", "start"]

# ---- worker ----
FROM base AS worker
ENV NODE_ENV=production
COPY --from=build /app ./
CMD ["npx", "tsx", "src/server/queue/worker.ts"]
