# ClipForge AI — Product Spec

> Working name: **ClipForge AI** ("From idea to publish-ready video."). Rename by
> changing `NEXT_PUBLIC_APP_NAME` in `.env` and the `brand.ts` config — see
> `src/config/brand.ts`. No third-party branding, trademarks, or copyrighted
> assets are used anywhere in this product.

## What this is

An AI content operating system for creators: turn a one-line idea into a
finished, publishable short-form or long-form video — script, visuals,
narration, music, captions, and a rendered MP4 — with transparent per-operation
credit costs and provider-agnostic AI generation.

This document describes the **full target product** (the "master directive").
`CLAUDE_PROGRESS.md` is the source of truth for what is actually implemented
today vs. what is roadmap. Do not assume a feature described here exists in
code until `CLAUDE_PROGRESS.md` or the Feature Matrix says so.

## Scope decision for this build

The directive this spec is derived from describes ~230 feature areas —
authentication, onboarding, a full dashboard, a multi-stage AI generation
pipeline, character consistency, talking objects, a 3D studio, a video editor,
social publishing to five platforms, a cron-based automation engine, Stripe
billing, an admin console, observability, i18n, and more. That is
multi-quarter work for a team, not something one session can honestly deliver
as production-ready. Per the directive's own rules (vertical slices, MVP
priority, "never pretend something works when it hasn't been tested"), this
build:

1. Implements a **real, working, end-to-end MVP pipeline** (idea → script →
   scenes → images → voiceover → captions → FFmpeg render → downloadable MP4)
   with accurate credit accounting, a durable job system, and a dashboard —
   this is Phase 1+2 of the directive's own build order (§101, §104, §218).
2. Implements the **data model and provider-abstraction architecture** broadly
   enough that later phases (characters, publishing, automation, billing,
   admin) are additive, not a rewrite.
3. Documents every unimplemented area honestly as roadmap in
   `CLAUDE_PROGRESS.md` and the Feature Matrix below, instead of shipping
   placeholder buttons that do nothing.

## Core user journey (implemented)

1. Sign up / log in (email+password; Google OAuth wired but requires operator
   credentials).
2. Land on dashboard: credit balance, plan, recent projects.
3. **Quick Create**: enter an idea, pick format/duration/style/voice/captions/
   music, see an estimated credit cost, click Generate.
4. Watch a real-time pipeline (script → scenes → images → voice → captions →
   render) with per-stage status, running server-side in a durable job queue
   (survives navigating away / closing the tab).
5. Credits are reserved before the job starts and settled to actual usage on
   completion; unused reservation is refunded automatically on failure.
6. Watch/download the finished MP4 from the project page.

## Beginner vs. Advanced mode

Quick Create is the beginner path (idea + a handful of high-level options).
Advanced mode (`/projects/:id/edit`) exposes per-scene prompts, durations,
media replacement, and voice/caption/music overrides on top of the same
underlying `Project`/`Scene` data model — see `ARCHITECTURE.md` §Data Model.

## Feature matrix

Status legend: ✅ implemented & tested · 🚧 architected (schema/interfaces
exist) but no UI/worker yet · 📋 roadmap only (design intent captured here).

| Area | Status | Notes |
|---|---|---|
| Email/password auth, sessions, logout-all-devices | ✅ | bcrypt, httpOnly session cookie, server-side session table |
| Google OAuth | 🚧 | route + schema exist, needs `GOOGLE_CLIENT_ID/SECRET` |
| Roles (USER/ADMIN/SUPPORT/SUPER_ADMIN) | ✅ | enforced server-side, never trusts client |
| Onboarding wizard | 📋 | `onboarding_completed`/preference fields exist on `User`; UI not built |
| Dashboard shell + nav | ✅ | |
| Credit ledger (reserve/settle/refund, immutable, integer) | ✅ | unit tested |
| Quick Create | ✅ | |
| Script generation | ✅ | Mock + OpenAI-compatible adapter |
| Scene planning / storyboard | ✅ | scenes persisted, regenerate-one-scene supported at data layer |
| Image generation | ✅ | Mock adapter (deterministic placeholder frames) + real Replicate (flux-schnell) adapter behind `REPLICATE_API_TOKEN`, not live-tested in this sandbox |
| Video generation (text/image-to-video) | 📋 | provider interface defined; no adapter implemented (needs a funded provider) |
| Voice / narration | ✅ | Mock TTS (deterministic tone) + real ElevenLabs adapter behind `ELEVENLABS_API_KEY` (real word-level timing via character alignment), not live-tested in this sandbox |
| Captions | ✅ | generated from narration script timing, burned into final render |
| Music / SFX | 🚧 | schema + timeline fields exist; auto-generation not implemented |
| FFmpeg render (Ken Burns + captions + narration) | ✅ | real ffmpeg pipeline, tested |
| Job system (durable, retryable, stage-level status) | ✅ | BullMQ + Redis + Postgres job/job_step rows |
| Realtime progress | ✅ | SSE endpoint backed by DB polling |
| Characters / consistency engine | 📋 | `Character` table exists; prompt-injection of canonical description not implemented |
| Talking objects, fruit/object story, 3D studio | 📋 | out of scope for this build; would reuse the same pipeline with different prompt templates |
| Video editor (timeline, trim, replace) | 📋 | Advanced page shows scene cards + per-scene regenerate; no drag timeline |
| Social publishing (YouTube/TikTok/IG/FB/X) | 📋 | `SocialAccount`/`PublishedPost` tables exist; no OAuth integrations wired |
| Automation engine | 📋 | `Automation`/`AutomationTopic` tables exist; no scheduler/worker |
| Billing (Stripe, plans, entitlements) | 🚧 | `Plan` table + seed data + `can()` entitlement helper exist; no Stripe integration |
| Admin console | 📋 | role exists and is enforced; no `/admin` UI |
| Moderation | 🚧 | prompt is checked against a basic denylist before generation; no ML moderation |
| Observability | 🚧 | structured JSON logs; no Sentry/OTel wiring (needs DSN) |
| i18n | 📋 | UI strings are not yet extracted to a catalog |

## Non-goals for this build (explicitly out of scope, see roadmap)

Social OAuth publishing, Stripe checkout, automation scheduler, admin UI,
character/talking-object/3D specialty generators, drag-and-drop timeline
editor, real vision-based QA, i18n catalogs, team workspaces. Each has a
data-model foothold so it can be added without breaking the core pipeline.
