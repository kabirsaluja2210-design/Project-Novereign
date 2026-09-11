# API Reference

All routes are Next.js Route Handlers under `src/app/api/`. Session auth is a
`cf_session` httpOnly cookie (set by login/signup) — there is no bearer-token
API yet (directive §206 "developer API keys" is roadmap). Every response is
JSON. Errors follow `{ error: string, message: string, ...details }` with an
appropriate HTTP status (see `src/server/http.ts` for the mapping).

## Auth

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/api/auth/signup` | `{ email, password, name? }` | Creates user, grants Free plan credits, starts session |
| POST | `/api/auth/login` | `{ email, password }` | Starts session |
| POST | `/api/auth/logout` | — | Revokes current session |
| POST | `/api/auth/logout-all` | — | Revokes every session for the user |
| GET | `/api/auth/me` | — | Current user, or `{ user: null }` |

## Projects

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/api/projects` | — | List the caller's projects |
| POST | `/api/projects` | `{ idea, aspectRatio, durationSec, styleKey?, voiceId?, language?, captionsEnabled?, musicEnabled?, sfxEnabled? }` | Creates a DRAFT project. No cost. |
| GET | `/api/projects/:id` | — | Project + scenes + latest job. 403 if not owned. |
| DELETE | `/api/projects/:id` | — | Deletes project (cascades scenes/media/jobs) |
| POST | `/api/projects/:id/generate` | `{ clientRequestId? }` | Reserves credits, creates a Job + JobSteps, enqueues the pipeline. Idempotent on `clientRequestId` (directive §76). |

## Jobs

| Method | Path | Notes |
|---|---|---|
| GET | `/api/jobs/:id` | Job + ordered JobSteps |
| GET | `/api/jobs/:id/stream` | Server-Sent Events: `stage_progress`, `job_completed`, `job_failed` (polls DB every 1.2s - see ARCHITECTURE.md) |

## Reference data

| Method | Path | Notes |
|---|---|---|
| GET | `/api/styles` | Active styles |
| GET | `/api/voices` | Active voices (mock catalog until a real TTS key is configured) |
| GET | `/api/templates/:id` | Single template (used by Quick Create's `?template=` prefill) |
| POST | `/api/credits/estimate` | `{ durationSec, captionsEnabled?, musicEnabled?, sfxEnabled? }` → credit estimate breakdown |

## Characters / support / account

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/api/characters` | List / create a saved character description |
| DELETE | `/api/characters/:id` | Owner-checked delete |
| GET/POST | `/api/support-tickets` | List / file a support ticket |
| PATCH | `/api/account` | Update `name`/`timezone` |
| DELETE | `/api/account` | Soft-deletes the account (see SECURITY.md) |

## Storage

| Method | Path | Notes |
|---|---|---|
| GET | `/api/storage/*` | Dev-only local file server for generated media. In production with `STORAGE_DRIVER=s3` this route is unused - clients get signed S3 URLs directly. |

## Not yet implemented (see PRODUCT_SPEC.md roadmap)

Billing/Stripe endpoints, social OAuth connect/publish endpoints, automation
CRUD, admin endpoints. The data model for all of these exists in
`prisma/schema.prisma`.
