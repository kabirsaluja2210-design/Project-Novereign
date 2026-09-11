# Claude Progress Log — ClipForge AI

_Last updated: 2026-09-11_

## Current Phase

Phase 1+2 complete (directive §101 build order: auth, DB, dashboard,
credits, projects, core generation pipeline). This is the MVP slice defined
in directive §103/§218/§101-105 and matches the directive's own instruction
to build in vertical slices rather than attempt all ~230 feature areas at
once — see `PRODUCT_SPEC.md` for the explicit scope decision and full
feature matrix.

## Completed

**Foundation**
- Next.js 15 (App Router) + TypeScript + Tailwind, pinned to stable versions
  (not the just-released Next 16, whose breaking changes aren't well-covered
  yet) after the initial scaffold pulled in Next 16 by default.
- Prisma schema covering the full data model from ARCHITECTURE.md: users,
  sessions, OAuth accounts, plans, credit ledger, projects/scenes/media/voice
  segments, characters, brands, styles, templates, voices, jobs/job steps,
  provider usage/config, social accounts, published posts, automations,
  notifications, audit log, support tickets, feature flags. Migrated and
  applied to a real local Postgres.
- Seed data: 5 plans (Free/Starter/Pro/Advanced/Enterprise) with
  DB-driven entitlements, 8 styles, 5 mock voices, 5 demo templates.

**Auth**
- Email/password signup+login, bcrypt hashing, httpOnly signed session
  cookie backed by a `Session` table, logout + logout-all-devices, role field
  enforced server-side (never trusted from client). Google OAuth schema
  (`OAuthAccount`) exists but has no route wired up (needs credentials).

**Credits**
- Append-only ledger, integer units, reserve→settle/refund flow, row-locked
  (`SELECT ... FOR UPDATE`) to prevent concurrent double-spend. Verified
  under test with two simultaneous reservations racing for the same balance
  (`tests/credits/ledger.test.ts`).

**AI provider abstraction**
- Normalized `ProviderResult<T>` contract, capability interfaces (text,
  image, voice), a Model Router with per-provider health tracking (Redis
  rolling failure count) and fallback, every attempt logged to
  `ProviderUsage`.
- Mock adapters for text/image/voice that produce **real files** (not
  stubbed success) via ffmpeg (`drawtext` placeholder images, `sine`+
  `tremolo` placeholder audio) and a template-based script generator - see
  `PROVIDERS.md`.
- Real adapters, all router-prioritized ahead of Mock, none live-tested in
  this sandbox (no API keys configured here - see PROVIDERS.md for exactly
  what "not live-tested" does and doesn't mean):
  - `OpenAITextProvider` (`OPENAI_API_KEY`) - script generation.
  - `ReplicateImageProvider` (`REPLICATE_API_TOKEN`, flux-schnell) - polls
    Replicate's prediction API, downloads the result, uploads to storage.
  - `ElevenLabsVoiceProvider` (`ELEVENLABS_API_KEY`) - uses the
    `with-timestamps` endpoint for real character-level alignment, grouped
    into word-level caption timing (more accurate than the mock's
    evenly-spaced estimate). Known limitation: always speaks with one fixed
    premade voice until real ElevenLabs rows are seeded into the `Voice`
    catalog - the user's voice selection is ignored until then.

**No-API-key operation (Piper local TTS)**
- Added in direct response to the request "create the platform so no APIs
  are needed": `PiperVoiceProvider` (`src/server/providers/voice/piper.ts`)
  wraps [Piper](https://github.com/rhasspy/piper), a real offline neural TTS
  engine, run as a spawned local binary - genuine synthesized speech with no
  API key, no account, no per-request cost, and no network access at
  runtime. Slotted into the voice router between ElevenLabs and Mock, so the
  full fallback chain is: ElevenLabs (best quality, needs a key) → Piper
  (real speech, no key) → Mock (placeholder tone, always available). Word
  timing is evenly distributed across the real ffprobe-measured output
  duration, not phoneme-accurate like ElevenLabs but genuine measured audio,
  not an estimate.
- The Piper binary and voice model are downloaded once at **Docker build
  time** into a new `piper` build stage and copied into the `worker` image
  only (the `web` image never calls voice providers) - the running
  containers make no outbound calls for this. With no `OPENAI_API_KEY`,
  `REPLICATE_API_TOKEN`, or `ELEVENLABS_API_KEY` set at all, the platform
  now runs the full idea→script→scenes→images→voice→captions→render
  pipeline with zero external API dependencies: Mock for text/images, Piper
  for real synthesized speech.
- Honesty note carried into `PROVIDERS.md` and the Dockerfile: this
  sandbox's network policy returns 403 for both `github.com` (Piper's
  release binary) and `huggingface.co` (the voice model), so the download
  URLs are written from Piper's documented, historically stable release/
  asset naming but were **not** verified live. If the build 404s on that
  stage, the fix is a one-line build-arg update (current release tag/asset
  name from https://github.com/rhasspy/piper/releases), not a code change.

**Job system & pipeline**
- BullMQ + Redis queue, Postgres-persisted `Job`/`JobStep` rows, 5-stage
  pipeline (script_generation → image_generation + voice_generation →
  caption_generation → render), per-scene retry (max 2 attempts) with
  bounded concurrency (3 concurrent scene generations).
- FFmpeg render: Ken Burns zoom per scene, muxed with that scene's
  narration, concatenated, burned-in word-grouped captions (libass
  `subtitles` filter), loudness-normalized audio, H.264/AAC 1080-class MP4,
  thumbnail extraction. **Scene transitions are hard cuts, not true
  crossfades** - `Scene.transition` is stored but not yet used by the
  renderer; that's the one deliberate simplification in the render path.
- SSE progress endpoint (DB-polling, 1.2s interval) + a live pipeline
  progress UI component.

**Dashboard**
- Full nav shell (Home, Create, Projects, Templates, Assets, Characters,
  Voices, Automations, Publishing, Analytics, Billing, Settings, Help).
- Quick Create: idea + format/duration/style/voice/captions/music/sfx,
  live credit estimate, template prefill via `?template=id`.
- Project detail: live pipeline progress, video player + download, per-scene
  cards, retry-on-failure.
- Real (not placeholder) pages: Templates, Voices, Assets (media library),
  Characters (CRUD), Billing (plan + real ledger history), Settings
  (profile, logout-all, soft account deletion), Help (FAQ + support
  ticket CRUD).
- Honest "not built" pages for Automations, Publishing, Analytics -
  each states exactly what integration is missing rather than showing a
  fake button (directive §106/§211).

**Verified end-to-end (real run, not a claim)** — see the exact transcript in
this build's session: signed up a user via `POST /api/auth/signup`, created
a project with the directive's own example idea ("a 30-second creepy story
about a man who gets a call from his future self"), called
`POST /api/projects/:id/generate`, polled `GET /api/jobs/:id` until
`SUCCEEDED`, downloaded the resulting MP4, and confirmed with `ffprobe` it's
a real, valid 1080×1920 H.264/AAC file (~23s, ~2MB). Verified the credit
ledger produced exactly the expected `SUBSCRIPTION_GRANT` →
`GENERATION_RESERVE` (-95) → `GENERATION_SETTLEMENT` (+10 refund, actual
cost 85) sequence with a correct final balance.

**Deployed and generating on a real machine outside this sandbox** - the
Docker Compose setup (`Dockerfile`/`docker-compose.yml`) was carried through
a full real-world install on the user's own Windows machine (Docker Desktop
+ WSL2), including diagnosing and fixing several genuine environment issues
along the way (WSL integration not enabled, docker group permissions,
transient containerd storage corruption, PowerShell not supporting `<`
redirection, Notepad silently appending `.txt`). End result: a live signup,
a live Quick Create run, and a real downloaded MP4 confirmed via `ffprobe`
(1080×1920, H.264/AAC, ~37s) - on infrastructure this session never touched.
That's the strongest evidence yet that `DEPLOYMENT.md`'s Path A is sound,
independent of anything run in this sandbox.

## In Progress / Not Started

See `PRODUCT_SPEC.md`'s feature matrix for the full list. Highlights:
character-consistency prompt injection, video editor timeline, social
publishing OAuth, automation scheduler, Stripe billing, admin console,
ML-based moderation, i18n catalogs, true crossfade transitions,
hard-delete-on-account-deletion, real video-gen and music/SFX adapters,
seeding a real per-provider `Voice` catalog (needed before ElevenLabs voice
selection actually works).

## Blocked

Nothing is blocked on missing sandbox access. Real (non-mock) image/video/
voice providers need API keys the operator must supply — the app runs fully
on Mock providers without them, by design.

## Tests

```
npm test        → 4 files, 21 tests, all passing
npm run typecheck → clean
npm run lint      → clean
npm run build     → clean production build (31 routes)
```

Covers: credit estimation math, credit ledger (including a concurrency race
test), IDOR protection on project/job access, and mock provider adapters
producing real, valid output files. See `TESTING.md` for what's covered vs.
what's manually-verified-only.

## Known Bugs / Cosmetic Issues

- In the rendered MP4, the Mock image provider's own debug label ("scene N
  of M...") can visually overlap the burned-in captions near the bottom of
  frame, since both mock systems place text independently without knowing
  about each other. Cosmetic only (both are debug/placeholder overlays);
  will resolve naturally once a real image provider replaces the mock
  (real generated images won't carry a text label).
- `npm audit` reports a moderate transitive `uuid` advisory via `bullmq`
  (see SECURITY.md) — not exploitable in our usage, not yet force-upgraded.

## Configuration Required

- `DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET` — required to run at all.
- `ffmpeg` on `PATH` for the worker process.
- Optional: `OPENAI_API_KEY` (real script generation), `REPLICATE_API_TOKEN`
  (real scene images), `ELEVENLABS_API_KEY` (real narration),
  `GOOGLE_CLIENT_ID`/`SECRET` (Google OAuth - route not yet implemented,
  schema only), `STORAGE_*` (S3-compatible storage instead of local disk).
  Without any of the three provider keys, generation runs entirely on Mock
  adapters - real files, placeholder content, by design (see PROVIDERS.md).

## Next Actions (recommended order)

1. Get a real `REPLICATE_API_TOKEN` and `ELEVENLABS_API_KEY` into a real
   deployment and confirm one full generation end-to-end - this is the one
   thing about the two new adapters this session could not do (no keys in
   this sandbox). Watch the worker logs and `ProviderUsage` rows on the
   first run.
2. Seed real ElevenLabs voice rows into the `Voice` table (map a handful of
   ElevenLabs premade/cloned voice ids to catalog entries) so the voice
   picker in Quick Create actually controls which voice speaks, instead of
   every real generation using the one hard-coded fallback voice.
3. Character-consistency prompt injection: when a scene's project has a
   selected `Character`, prepend its canonical `description` to every scene
   `visualPrompt` sent to the image provider (the `Character` table and CRUD
   UI already exist; this is a small change in `pipeline.ts`'s
   `image_generation` stage).
4. True crossfade transitions in `render.ts` (replace the `concat` demuxer
   pass with an `xfade`-based filtergraph).
5. Stripe billing (see BILLING.md for the exact integration points).
6. Social publishing for one platform end-to-end (YouTube is the least
   fragmented API) to prove out the `SocialAccount`/`PublishedPost` model.
