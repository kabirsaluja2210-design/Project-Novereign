# Deployment

This build has been run and tested locally (see CLAUDE_PROGRESS.md for the
exact end-to-end run). It has not been deployed to any hosted environment.
This document describes how to, and what changes first.

## Processes

Two long-lived processes, both stateless (all state in Postgres/Redis/object
storage) so either can run as multiple replicas behind a load balancer /
queue:

1. **Web** (`npm run build && npm run start`) - Next.js app: pages, API
   routes. Never runs the generation pipeline in-process (directive §120).
2. **Worker** (`npm run worker`, i.e. `tsx src/server/queue/worker.ts`) -
   BullMQ consumer that runs `runPipeline()`, including the FFmpeg render.
   CPU-bound (video encoding) - size this box for CPU, not memory, and scale
   it independently of the web tier.

## Infrastructure

- **Postgres**: any managed Postgres 16 (RDS, Cloud SQL, Supabase, etc.).
  Run `npx prisma migrate deploy` (not `migrate dev`) on release.
- **Redis**: managed Redis (ElastiCache, Upstash, etc.) for BullMQ + rate
  limiting + provider health tracking.
- **Object storage**: switch `STORAGE_DRIVER=s3` and implement the
  `ObjectStorage` interface (`src/server/storage/index.ts`) against the AWS
  SDK for S3/R2/B2 - the interface is already the seam; nothing above it
  changes. Once switched, `Media.storageUrl`/`Project.finalVideoUrl` should
  be signed URLs generated at read time rather than the current
  `/api/storage/*` dev route.
- **ffmpeg**: must be on `PATH` in the worker's container image. The render
  pipeline shells out to the system binary directly (no bundled/static
  ffmpeg dependency), so pin a specific ffmpeg version in the worker
  Dockerfile for reproducible renders.

## Suggested topology

- Web tier: containerized, autoscaled on request volume (or Vercel, if you
  accept its execution-time limits for API routes - none of this build's
  routes do long synchronous work, so that's compatible).
- Worker tier: containerized, autoscaled on BullMQ queue depth, CPU-sized for
  concurrent ffmpeg encodes. This is why the render step is a separate
  process from the web tier (directive §31/§120).

## Environment variables

See `.env.example` for the full list. At minimum for a working deploy:
`DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET` (rotate per environment),
`APP_BASE_URL`, `STORAGE_*`. Everything else (provider keys, OAuth) is
additive - the app runs without them, just on Mock providers.

## Release checklist (not yet exercised end-to-end here)

1. `npx prisma migrate deploy`
2. `npm run db:seed` (idempotent - upserts plans/styles, only inserts
   voices/templates if missing)
3. Build + deploy web image
4. Deploy/restart worker image
5. Smoke test: sign up, Quick Create a short video, confirm MP4 renders and
   downloads (this is exactly the flow scripted in this build's own local
   verification - see CLAUDE_PROGRESS.md)

## Not addressed here

Load testing, backup/restore drills, blue-green or canary release, CDN in
front of object storage, WAF/DDoS protection, secrets manager integration
(env vars assumed injected by the platform). These are directive §220
"Production release criteria" items genuinely out of scope for this build.
