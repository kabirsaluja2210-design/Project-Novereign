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

# ---- piper (local, no-API-key text-to-speech - see PROVIDERS.md) ----
# Downloaded once at image-build time only; the running app never calls out
# to GitHub/HuggingFace - this is what makes voice generation possible with
# zero API keys and zero per-request cost.
#
# HONESTY NOTE: these URLs were written from Piper's documented, historically
# stable release/asset naming, but could not be verified live from this
# session's sandbox (GitHub releases and huggingface.co both return 403 there
# due to that environment's own network policy - unrelated to your machine).
# If this stage 404s, check https://github.com/rhasspy/piper/releases for
# the current release tag/asset name and override the build args below.
FROM base AS piper
ARG PIPER_VERSION=2023.11.14-2
ARG PIPER_ASSET=piper_linux_x86_64.tar.gz
ARG PIPER_VOICE=en_US-lessac-medium
ARG PIPER_VOICE_PATH=en/en_US/lessac/medium
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /opt/piper/voices \
    && curl -fL -o /tmp/piper.tar.gz \
       "https://github.com/rhasspy/piper/releases/download/${PIPER_VERSION}/${PIPER_ASSET}" \
    && tar -xzf /tmp/piper.tar.gz -C /opt/piper --strip-components=1 \
    && rm /tmp/piper.tar.gz \
    && curl -fL -o "/opt/piper/voices/${PIPER_VOICE}.onnx" \
       "https://huggingface.co/rhasspy/piper-voices/resolve/main/${PIPER_VOICE_PATH}/${PIPER_VOICE}.onnx" \
    && curl -fL -o "/opt/piper/voices/${PIPER_VOICE}.onnx.json" \
       "https://huggingface.co/rhasspy/piper-voices/resolve/main/${PIPER_VOICE_PATH}/${PIPER_VOICE}.onnx.json"

# ---- web ----
FROM base AS web
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "run", "start"]

# ---- worker ----
# The only target that needs Piper - voice generation happens here, not in
# the web process.
FROM base AS worker
ENV NODE_ENV=production
COPY --from=build /app ./
COPY --from=piper /opt/piper /opt/piper
ENV PIPER_BINARY_PATH=/opt/piper/piper
ENV PIPER_MODEL_PATH=/opt/piper/voices/en_US-lessac-medium.onnx
CMD ["npx", "tsx", "src/server/queue/worker.ts"]
