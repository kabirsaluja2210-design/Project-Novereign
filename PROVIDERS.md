# AI Providers

## The contract

Every capability (text, image, voice - see `src/server/providers/types.ts`)
is an interface with a single method returning a normalized
`ProviderResult<T>`. Business logic (the pipeline in
`src/server/queue/pipeline.ts`) never sees a provider-specific response
shape, only `ProviderResult`. This is what makes swapping providers safe.

Every adapter declares `kind: "mock" | "real"` and that tag is persisted on
every `Media`/`VoiceSegment` row and every `ProviderUsage` log line - you can
always tell, after the fact, whether a given asset came from a real
generative model or the built-in placeholder.

## What "Mock" actually does (this matters)

These are not stubs that return fake success with no output - they produce
real files so the entire pipeline (timing, captions, credit accounting,
FFmpeg render) is genuinely exercised without any paid API key:

- **`MockTextProvider`** (`src/server/providers/text/mock.ts`): a
  template-based script generator that builds a real hook/premise/escalation/
  complication/payoff scene breakdown from the user's idea (directive §17).
  No LLM call.
- **`MockImageProvider`** (`src/server/providers/image/mock.ts`): renders a
  labeled placeholder PNG via `ffmpeg`'s `lavfi color` source + `drawtext`
  filter. Color is deterministic per-prompt (hash-based), so regenerating
  with the same seed is reproducible.
- **`MockVoiceProvider`** (`src/server/providers/voice/mock.ts`): synthesizes
  a soft placeholder tone (not real speech) via `ffmpeg`'s `sine` + `tremolo`
  filters, with duration estimated from word count at ~150 wpm, and
  evenly-spaced word-level timing data so captions and render timing are real.

None of these call an external network API, so the whole app - signup
through downloadable MP4 - runs with zero configuration.

## Adding a real provider

1. Implement the interface in `src/server/providers/<capability>/<name>.ts`,
   returning `kind: "real"` and a `costUnits` computed from actual usage
   (tokens/seconds/images) via your own internal accounting conversion.
2. Register it in `src/server/providers/router.ts`'s ordered list for that
   capability (earlier = tried first). `isAvailable()` should check for the
   required env var so an unconfigured provider is silently skipped rather
   than attempted and failing.
3. Add the required env var(s) to `.env.example`.

The router (`src/server/providers/router.ts`) already handles: skipping
disabled providers (`ProviderConfig` table, admin-editable), skipping
providers with a high recent failure rate (rolling counter in Redis,
directive §225), falling through to the next provider on failure, and
logging every attempt to `ProviderUsage` for cost/margin reporting.

## Provider status in this build

| Capability | Real adapter | Status |
|---|---|---|
| Text | `OpenAITextProvider` (`OPENAI_API_KEY`) | Implemented, **not live-tested in this sandbox** (no key configured here) - review before trusting in production |
| Image | `ReplicateImageProvider` (`REPLICATE_API_TOKEN`, `black-forest-labs/flux-schnell`) | Implemented, **not live-tested in this sandbox** (no key configured here). Polls Replicate's official-model prediction endpoint, downloads the result, uploads to storage. Maps the requested pixel size to the nearest of Replicate's supported aspect-ratio enum values. |
| Voice | `ElevenLabsVoiceProvider` (`ELEVENLABS_API_KEY`) | Implemented, **not live-tested in this sandbox** (no key configured here). Uses ElevenLabs' `with-timestamps` endpoint, so caption/render timing comes from real character-level alignment rather than the mock's evenly-spaced estimate. **Known limitation**: the seeded `Voice` catalog only has mock provider rows today, so this adapter ignores the user's voice selection and always speaks with one fixed premade voice ("Rachel") until real ElevenLabs voice rows are seeded - see PRODUCT_SPEC.md roadmap. |
| Video (text-to-video / image-to-video) | — | Not implemented. The render pipeline currently only does Ken Burns motion over still images (directive §139 cheap mode); a real video-gen adapter is a genuinely separate, higher-cost integration. |
| Music / SFX | — | Not implemented (schema exists: `Project.musicEnabled`/`sfxEnabled`, `OPERATION_COSTS.MUSIC_TRACK`/`SFX_PER_SCENE`, but no generation call is made yet). |

Both new adapters were built the same way as the OpenAI text adapter: written and
code-reviewed against each provider's public API docs, wired into the router
ahead of Mock, and verified to typecheck/lint/build cleanly - but neither has
been exercised against a live API key in this sandbox. Test with a real key
before relying on them in production, and watch `ProviderUsage` / worker logs
on the first few real generations.

## Model Router health/fallback

`src/server/providers/router.ts` tracks a rolling failure counter per
`(capability, provider)` in Redis (`provider_health:*`, 5-minute window,
threshold 5 failures) and skips an unhealthy provider until the window
expires. Every attempt - success or failure - is written to the
`ProviderUsage` table with cost, duration, and error code for admin/cost
reporting (directive §223).
