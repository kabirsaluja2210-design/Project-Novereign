# Billing

## What's real in this build

- **Plans** (`Plan` table, seeded via `prisma/seed.ts`): FREE / STARTER / PRO
  / ADVANCED / ENTERPRISE with `monthlyCredits`, `maxVideoDurationSec`,
  `maxSocialAccounts`, and a JSON `entitlements` map. These numbers are
  illustrative defaults for this build, not a copy of any competitor's
  pricing, and are fully admin-editable in the DB (no code changes needed to
  retune them).
- **Credit ledger** (`src/server/credits/ledger.ts`): append-only
  `CreditTransaction` rows, integer units only, reserve → settle/refund flow.
  See ARCHITECTURE.md for the full mechanics and `tests/credits/ledger.test.ts`
  for the behavior under test (including a concurrent-reservation race).
- **Credit estimation** (`src/server/credits/estimate.ts`): per-operation
  cost constants (`OPERATION_COSTS`) drive the Quick Create estimate shown
  before generation and the actual reservation amount.
- **Entitlement engine** (`src/server/auth/entitlements.ts`): `can(user,
  "AUTOMATION")` etc. reads the user's `Plan.entitlements` JSON - no
  `if (plan === "pro")` scattered through the app (directive §227).
- **Billing page** (`/dashboard/billing`): shows current plan, credit
  balance, monthly grant, and full transaction history from the real ledger.

## What's not wired up

No Stripe integration. There is no checkout, no subscription webhook
handling, no payment method storage. "Upgrade" is not offered as a button
that does nothing - the billing page says plainly that upgrades aren't
self-serve yet.

## Adding Stripe (the real next step)

1. `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` env vars (already listed in
   `.env.example`).
2. A checkout session endpoint that maps a `Plan.key` to a Stripe Price ID.
3. A webhook endpoint (`/api/webhooks/stripe`) that verifies the signature
   (never trust an unverified webhook body - directive §75) and, on
   `checkout.session.completed` / `invoice.paid`, calls
   `grantCredits({ type: "SUBSCRIPTION_GRANT", ... })` - the ledger function
   already exists and is idempotent-safe if you key `referenceId` off the
   Stripe event id and check for an existing transaction first.
4. `invoice.payment_failed` → set a grace-period flag and notify (the
   `Notification` model already has a `payment_failed` event name reserved).

## Operation costs (directive §143/§144)

Defined in `src/server/credits/estimate.ts` as `OPERATION_COSTS` - currently
constants in code rather than a DB-editable `OperationCost` table. Moving
them into the DB (mirroring how `Plan` already works) is a small, contained
follow-up once real provider costs are known and pricing needs live tuning.
