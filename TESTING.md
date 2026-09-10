# Testing

## Running tests

```bash
npm test          # vitest run - all tests, once
npm run test:watch
npm run typecheck  # tsc --noEmit
npm run lint       # eslint src
```

Tests need a running Postgres (`DATABASE_URL`) and, for the provider tests,
a working `ffmpeg` on `PATH`. Redis is not required for the current test
suite (BullMQ/queue code isn't unit tested directly - see below).

**Known simplification**: tests run against the same database as
`DATABASE_URL` points to (no separate `clipforge_test` database wired up in
this sandbox). Every test creates its own disposable user(s) with a unique,
greppable email prefix (`ledger-test-`, `idor-test-`) and cleans them up in
`afterAll`. Before running against a shared/staging database, point
`DATABASE_URL` at a dedicated test database instead.

## What's covered

| File | Covers |
|---|---|
| `tests/credits/estimate.test.ts` | Pure credit estimation math: integer costs, optional line items, scaling with duration |
| `tests/credits/ledger.test.ts` | Real-DB: grant/reserve/settle/refund, never-negative balance, append-only history, **concurrent reservation race** (asserts only one of two simultaneous reservations for the same balance succeeds - proves the `SELECT ... FOR UPDATE` row lock actually prevents double-spend) |
| `tests/security/idor.test.ts` | A second user cannot fetch another user's project/job by id |
| `tests/providers/mock.test.ts` | Mock text/image/voice adapters produce real, non-trivial files (not just a "success: true" with no output) - image is a valid PNG, voice duration scales with text length |

## What's verified manually but not yet automated as a test

The full pipeline was run end-to-end against the live dev stack (signup →
create project → generate → poll job → verify rendered MP4 via `ffprobe` →
verify credit ledger entries) as part of this build - see
`CLAUDE_PROGRESS.md` for the exact commands and output. Turning that into an
automated integration test (spinning up the worker in-process, running one
full mock-provider generation, asserting on the output MP4) is the natural
next addition and is a small lift given the manual script already exists.

No Playwright/browser E2E tests exist yet (directive §100). The UI has been
exercised manually (signup, login, Quick Create, live SSE progress, project
detail, billing, characters, settings) but not scripted.

## Deliberately not tested here

Anything behind a real provider API key (OpenAI text adapter), Stripe,
social OAuth, automation - none of these are implemented/wired in this build
(see PRODUCT_SPEC.md roadmap), so there's nothing to test yet.
