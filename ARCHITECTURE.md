# Architecture

## Stack

| Concern | Choice | Why |
|---|---|---|
| Web app | Next.js 14 (App Router) + TypeScript | Server components for dashboard, API routes for mutations, one deployable for UI + BFF |
| Styling | Tailwind CSS | fast, consistent design tokens (see `tailwind.config.ts`) |
| DB | PostgreSQL | relational integrity for credits/jobs is non-negotiable |
| ORM | Prisma | typed schema, migrations, good DX |
| Queue | BullMQ on Redis | durable jobs, retries, per-provider concurrency limits (§77/§177 of directive) |
| Render worker | Node + fluent-ffmpeg wrapping system `ffmpeg` | deterministic, scriptable, no vendor lock-in |
| Storage | Local filesystem in dev behind an `ObjectStorage` interface; S3-compatible adapter for prod | directive §30 forbids storing binaries in Postgres; interface keeps prod portable to S3/R2/B2 |
| Auth | Custom session-cookie auth (bcrypt + httpOnly signed session id in DB) | no external dependency required to run locally; Google OAuth is an additive provider |
| Realtime | Server-Sent Events (`/api/jobs/:id/stream`) backed by DB polling | simpler operational footprint than a WS server for a single-writer progress feed |

The web process and the worker process share the same codebase and Prisma
client but run as separate entrypoints (`npm run dev` for web, `npm run
worker` for the queue consumer) — see §120/§121 of the directive: never await
a long generation inside an API route.

## Request flow (Quick Create)

```
Browser
  │  POST /api/projects            (create project row, status DRAFT)
  │  POST /api/projects/:id/generate
  ▼
API route (apps/web)
  │  1. estimate credits for requested duration/style
  │  2. BEGIN TRANSACTION
  │       - re-check balance
  │       - insert CreditTransaction(type=GENERATION_RESERVE, amount=-N)
  │       - insert Job(status=QUEUED) + JobStep rows for each pipeline stage
  │     COMMIT
  │  3. enqueue BullMQ job { jobId }
  │  4. return { jobId } immediately (< 200ms)
  ▼
Browser opens SSE stream /api/jobs/:id/stream → renders live stage list
  ▼
Worker process (apps/worker) picks up job from Redis
  │  for each stage in the pipeline DAG:
  │     - mark JobStep RUNNING
  │     - call provider via the Model Router
  │     - persist output (Scene/Media/VoiceSegment rows, files in storage)
  │     - mark JobStep SUCCEEDED / FAILED (+ retry policy)
  │  on full success: settle credits (GENERATION_SETTLEMENT), mark Job SUCCEEDED
  │  on failure before any billable provider call: refund reservation (GENERATION_REFUND)
  ▼
Postgres is the single source of truth for job/stage state; SSE just polls it.
```

## Pipeline DAG (implemented subset of directive §7/§199)

```
script_generation
   ├─▶ scene_planning ─▶ image_generation (per scene, parallel) ─┐
   └─▶ voice_generation (per scene, parallel) ──────────────────┼─▶ caption_generation ─▶ render ─▶ done
```

Each stage is an independent `JobStep` row with `status`, `attempts`,
`last_error`, `input`, `output` (jsonb). Stages are retryable individually —
retrying `image_generation` for one scene does not re-run `script_generation`.

## Provider abstraction (directive §8/§224)

```ts
interface ProviderResult<T> {
  success: boolean;
  provider: string;      // e.g. "mock", "openai"
  model?: string;
  jobId?: string;
  assetUrl?: string;
  durationMs?: number;
  width?: number; height?: number;
  costUnits: number;     // internal accounting units, integer
  currency?: string;
  metadata?: Record<string, unknown>;
  error?: { code: string; message: string; retryable: boolean };
}

interface TextGenerationProvider {
  name: string;
  generateScript(input: ScriptRequest): Promise<ProviderResult<ScriptOutput>>;
}
interface ImageGenerationProvider {
  name: string;
  generateImage(input: ImageRequest): Promise<ProviderResult<ImageOutput>>;
}
interface VoiceGenerationProvider {
  name: string;
  generateVoice(input: VoiceRequest): Promise<ProviderResult<VoiceOutput>>;
}
```

No provider-specific type ever leaves `src/server/providers/*/adapter.ts`.
Business logic only sees `ProviderResult`. Every adapter is tagged
`kind: "mock" | "real"` and production code paths log which kind served a
request — mocks and real providers are never silently interchangeable
(directive §105).

### Model Router

`src/server/providers/router.ts` picks a provider per capability from a
priority-ordered list read from `ProviderConfig` (DB, admin-editable — see
`Plan`/`ProviderConfig` in schema). Selection considers, in order: provider
`enabled` flag → plan entitlement → declared health (a rolling error-rate
counter kept in Redis) → priority. On failure it retries once, then falls
through to the next provider in the chain. If a capability has only a mock
provider configured (i.e. no API key set), that's what serves the request —
this is intentional so the whole app is runnable with zero external
credentials.

## Credit ledger (directive §10/§122)

Ledger is append-only (`CreditTransaction`). `User.creditBalance` is a
denormalized cache updated in the *same* DB transaction as each ledger row,
never independently. All amounts are integers (no floating point). Reserve →
settle/refund is the only path that spends credits:

```
reserveCredits(userId, amount, {source, referenceId}) // throws if insufficient
  -> creates GENERATION_RESERVE txn (negative amount), decrements balance
settleGeneration(reservationTxnId, actualAmount)
  -> creates GENERATION_SETTLEMENT txn for the delta (can be 0)
refundReservation(reservationTxnId)
  -> creates GENERATION_REFUND txn crediting back the full reservation
```

Both operations run inside a Prisma `$transaction` with `SELECT ... FOR
UPDATE`-equivalent row locking (Prisma's serializable isolation on the user
row) to prevent double-spend races.

## Data model

See `prisma/schema.prisma` for the authoritative schema. Key tables:
`User`, `Session`, `OAuthAccount`, `Plan`, `CreditTransaction`, `Project`,
`Scene`, `Media`, `VoiceSegment`, `Character`, `Brand`, `Style`, `Template`,
`Voice`, `Job`, `JobStep`, `ProviderUsage`, `SocialAccount`, `PublishedPost`,
`Automation`, `AutomationTopic`, `Notification`, `AuditLog`, `SupportTicket`,
`FeatureFlag`.

Every user-owned table carries `userId` and every query goes through
`requireOwnedProject()`/`requireSession()` helpers in `src/server/auth.ts` —
there is no query path that fetches a project without a `WHERE userId = ...`
clause (directive §123, IDOR prevention; covered by `tests/idor.test.ts`).

## Render pipeline

`src/server/render/ffmpeg.ts`:
1. Download/verify each scene's image + voice audio from storage.
2. Per scene: apply a Ken Burns zoom/pan filter over the still image for the
   scene's duration (directive §139 — cheap-mode video without a video-gen
   provider), mux with that scene's narration audio.
3. Concatenate scenes with a crossfade transition.
4. Mix in captions (burned via `subtitles` filter from a generated `.srt`).
5. Normalize audio loudness (`loudnorm`), encode H.264/AAC 1080p 30fps MP4
   (directive §31 defaults).
6. Upload result to storage, generate a poster-frame thumbnail, update
   `Project.status = READY`.

## Why not [X]

- **NextAuth/Clerk**: added for a future pass; a from-scratch session store
  keeps the MVP runnable with zero external accounts and makes the
  reserve/settle transaction model easier to reason about test-first.
- **Kubernetes/serverless render workers**: the render worker is a plain Node
  process here; `DEPLOYMENT.md` describes how to run it as an autoscaled
  container group behind the same Redis queue in production.
