# Security

## Authentication & sessions

- Passwords hashed with bcrypt (12 rounds), never logged, never returned in
  any API response.
- Sessions: a random 32-byte token is set as an httpOnly, `SameSite=Lax`
  cookie; only its SHA-256 hash (keyed with `SESSION_SECRET`) is stored in
  the `Session` table. Stealing the DB does not hand you usable session
  tokens.
- Logout revokes the current session (`revokedAt`); logout-all-devices
  revokes every session row for the user.
- Roles (`USER`/`ADMIN`/`SUPPORT`/`SUPER_ADMIN`) live on the `User` row,
  read fresh from the DB on every request via `requireSession()` /
  `requireRole()` - the client never supplies or influences role.

## IDOR prevention (directive §123)

Every project/job fetch goes through `requireOwnedProject(id, userId)` /
`requireOwnedJob(id, userId)` (`src/server/auth/session.ts`), which query
`WHERE id = ? AND userId = ?` and throw `ForbiddenError` (mapped to HTTP 403)
if the row doesn't match. There is no code path that fetches a project or job
by id alone. `tests/security/idor.test.ts` asserts this directly: a second
user cannot read a project or job they don't own by guessing/reusing its id.

## Injection

- All DB access goes through Prisma's query builder (parameterized). The one
  raw SQL call (`SELECT ... FOR UPDATE` in the credit ledger) uses Prisma's
  tagged-template `$queryRaw`, which parameterizes the interpolated value -
  it is not string concatenation.
- FFmpeg is invoked via `child_process.spawn` with an argv array and
  `shell: false` (the default) - user-controlled text (prompts, narration)
  is never interpolated into a shell command string, closing off command
  injection (directive §61/§62). Text that reaches an FFmpeg filter
  (`drawtext`, `subtitles`) is escaped for filtergraph syntax
  (`escapeFfmpegText`), not shell syntax, because it never touches a shell.
- Zod validates every API request body before it reaches business logic.

## Prompt injection / moderation

- `src/server/moderation/check.ts` runs a denylist check on the user's idea
  before a project is created. This is explicitly **not** sufficient content
  moderation for production (see PRODUCT_SPEC.md roadmap) - it exists so the
  endpoint isn't wide open while a real moderation provider is added.
- The OpenAI text adapter's system prompt explicitly instructs the model not
  to follow instructions embedded in the user's idea text (directive §62) -
  untested against adversarial input in this sandbox since no API key is
  configured here.

## Secrets

- All provider keys, `SESSION_SECRET`, and storage credentials come from
  environment variables (`.env`, not committed - see `.gitignore`).
  `.env.example` documents every variable without real values.
- Nothing in `src/server` logs a password, session token, or provider API
  key. `console.error` in `toErrorResponse` logs the error object itself,
  which for provider errors is our own normalized `{ code, message }` -
  provider SDKs are not logged raw.

## Rate limiting

Redis-backed fixed-window limiter (`src/server/rate-limit.ts`) applied to
signup, login, project creation, and generation requests - see call sites in
`src/app/api/**/route.ts` for current limits.

## Known residual risk / honest gaps

- **CSRF**: session cookie is `SameSite=Lax`, which blocks cross-site
  `POST` from a plain `<form>`/fetch on another origin in modern browsers,
  but there is no explicit CSRF token. Acceptable for this build's scope;
  worth adding a token before treating this as production-hardened.
- **`uuid` transitive advisory**: `bullmq` depends on an older `uuid` range
  with a moderate advisory (buffer bounds check when a caller-supplied `buf`
  is passed - `bullmq` does not do this). Tracked; not forcing a breaking
  `npm audit fix --force` mid-build. Re-check `npm audit` before shipping.
- **Account deletion is a soft delete** (status flips to `DELETED`, email
  scrambled) - rows and object-storage files are not hard-deleted yet. See
  BILLING.md-adjacent note in `src/app/api/account/route.ts`.
- **No 2FA, no email verification enforcement** yet (schema has
  `emailVerifiedAt` but nothing currently requires it before login).
- **Moderation is a denylist**, not an ML classifier - see above.
