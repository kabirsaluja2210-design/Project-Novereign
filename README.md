# ClipForge AI

Turn an idea into a finished, publish-ready video. ClipForge AI generates a
script, scene visuals, voiceover, and captions through a durable AI pipeline,
then renders a downloadable MP4 with FFmpeg — with transparent, per-operation
credit accounting throughout.

> Working name pending final branding — see `src/config/brand.ts`.

This repository is one build phase of a much larger product spec. Read
**`PRODUCT_SPEC.md`** first — it explains exactly what's implemented vs.
roadmap, and why. **`CLAUDE_PROGRESS.md`** tracks current status in detail.

## Quick start

Requirements: Node 20+, PostgreSQL 16, Redis 7, `ffmpeg` on `PATH`.

```bash
cp .env.example .env        # edit DATABASE_URL / REDIS_URL / SESSION_SECRET
npm install
npm run db:migrate          # applies prisma/schema.prisma
npm run db:seed             # plans, styles, voices, templates
npm run dev                 # web app on http://localhost:3000
npm run worker              # in a second terminal - the generation pipeline worker
```

Sign up, go to **Create**, describe an idea, and click **Generate video**.
The whole pipeline (script → scenes → images → voice → captions → render)
runs with zero external API keys configured, using the built-in Mock
providers — see `PROVIDERS.md` for what "Mock" actually produces and how to
swap in real ones.

## Repository map

```
prisma/schema.prisma       Data model (see ARCHITECTURE.md)
src/app/                   Next.js App Router - pages + API routes
src/server/                All server-only logic (never imported by client components)
  auth/                    Sessions, password hashing, entitlements
  credits/                 Ledger (reserve/settle/refund) + cost estimation
  providers/               AI provider interfaces, mock + real adapters, router
  queue/                   BullMQ queue, worker entrypoint, pipeline orchestration
  render/                  FFmpeg render pipeline, captions, dimensions
  storage/                 Object storage abstraction (local disk / S3-ready)
src/components/            UI primitives + dashboard components
tests/                     Vitest unit + integration tests
```

## Documentation

| File | Contents |
|---|---|
| `PRODUCT_SPEC.md` | Full target product spec, scope decisions, feature matrix |
| `ARCHITECTURE.md` | Stack choices, request flow, pipeline DAG, data model |
| `API.md` | HTTP API reference |
| `PROVIDERS.md` | AI provider adapters - what's mock vs. real, how to add one |
| `BILLING.md` | Credit ledger mechanics, plans, what Stripe integration would need |
| `SECURITY.md` | Auth, IDOR prevention, secrets, known residual risk |
| `DEPLOYMENT.md` | Running this in production |
| `TESTING.md` | How to run tests, what's covered |
| `TROUBLESHOOTING.md` | Common local dev issues |
| `CLAUDE_PROGRESS.md` | Live status: done / in progress / blocked / next steps |
