import { prisma } from "@/server/db";
import { InsufficientCreditsError } from "@/server/errors";
import type { CreditTransactionType, Prisma } from "@prisma/client";

/**
 * Credit ledger (directive §10/§122). CreditTransaction rows are append-only;
 * `User.creditBalance` is a denormalized cache that is only ever mutated in
 * the same DB transaction as the ledger row that explains the change. All
 * amounts are integer credit units - never floating point.
 *
 * Concurrency: every mutation takes a `SELECT ... FOR UPDATE` row lock on the
 * user row inside a transaction, so two concurrent reservations for the same
 * user cannot both read a stale balance and double-spend.
 *
 * Every exported function accepts an optional `tx` (an existing Prisma
 * transaction client). Pass one when the reservation/settlement must be
 * atomic with other writes (e.g. creating the Job row) - otherwise the
 * function opens its own transaction.
 */

type Client = Prisma.TransactionClient;

async function lockUserBalance(tx: Client, userId: string): Promise<number> {
  const rows = await tx.$queryRaw<{ creditBalance: number }[]>`
    SELECT "creditBalance" FROM "User" WHERE id = ${userId} FOR UPDATE
  `;
  const row = rows[0];
  if (!row) throw new Error(`User ${userId} not found`);
  return row.creditBalance;
}

async function writeTransaction(
  tx: Client,
  params: {
    userId: string;
    type: CreditTransactionType;
    amount: number; // signed
    source: string;
    referenceId?: string;
    description?: string;
  },
): Promise<{ id: string; balanceAfter: number }> {
  const currentBalance = await lockUserBalance(tx, params.userId);
  const balanceAfter = currentBalance + params.amount;
  if (balanceAfter < 0) {
    throw new InsufficientCreditsError(-params.amount, currentBalance);
  }

  const txn = await tx.creditTransaction.create({
    data: {
      userId: params.userId,
      type: params.type,
      amount: params.amount,
      balanceAfter,
      source: params.source,
      referenceId: params.referenceId,
      description: params.description,
    },
  });

  await tx.user.update({
    where: { id: params.userId },
    data: { creditBalance: balanceAfter },
  });

  return { id: txn.id, balanceAfter };
}

/** Runs `fn` with either the caller-supplied transaction client or a fresh one. */
async function withClient<T>(tx: Client | undefined, fn: (tx: Client) => Promise<T>): Promise<T> {
  if (tx) return fn(tx);
  return prisma.$transaction((freshTx) => fn(freshTx));
}

/** Grants credits (subscription, purchase, admin, promo). Amount must be positive. */
export async function grantCredits(
  params: {
    userId: string;
    amount: number;
    type: Extract<
      CreditTransactionType,
      "SUBSCRIPTION_GRANT" | "PURCHASE" | "ADMIN_ADJUSTMENT" | "PROMOTIONAL_CREDIT"
    >;
    source: string;
    referenceId?: string;
    description?: string;
  },
  tx?: Client,
) {
  if (params.amount <= 0) throw new Error("grantCredits amount must be positive");
  return withClient(tx, (client) => writeTransaction(client, params));
}

/**
 * Reserves credits for a generation job before any provider is called.
 * Throws InsufficientCreditsError if the user cannot afford it.
 */
export async function reserveCredits(
  params: {
    userId: string;
    amount: number;
    source: string;
    referenceId?: string;
    description?: string;
  },
  tx?: Client,
): Promise<{ reservationTxnId: string; balanceAfter: number }> {
  if (params.amount <= 0) throw new Error("reserveCredits amount must be positive");
  const result = await withClient(tx, (client) =>
    writeTransaction(client, {
      userId: params.userId,
      type: "GENERATION_RESERVE",
      amount: -params.amount,
      source: params.source,
      referenceId: params.referenceId,
      description: params.description ?? "Credit reservation",
    }),
  );
  return { reservationTxnId: result.id, balanceAfter: result.balanceAfter };
}

/**
 * Settles a reservation against actual usage. If actual cost is less than
 * reserved, the difference is refunded. If actual cost exceeds the
 * reservation (should be rare - estimates are meant to be conservative), the
 * overage is NOT charged (we never surprise-bill); it is recorded via
 * ProviderUsage for admin reconciliation instead (directive §233).
 */
export async function settleGeneration(
  params: { reservationTxnId: string; actualAmount: number },
  tx?: Client,
): Promise<{ refunded: number; overageUnbilled: number }> {
  const client = tx ?? prisma;
  const reservation = await client.creditTransaction.findUnique({
    where: { id: params.reservationTxnId },
  });
  if (!reservation || reservation.type !== "GENERATION_RESERVE") {
    throw new Error("Invalid reservation transaction");
  }
  const reservedAmount = -reservation.amount; // stored as negative
  const delta = reservedAmount - params.actualAmount; // positive => refund unused

  if (delta === 0) {
    return { refunded: 0, overageUnbilled: 0 };
  }

  if (delta > 0) {
    await withClient(tx, (c) =>
      writeTransaction(c, {
        userId: reservation.userId,
        type: "GENERATION_SETTLEMENT",
        amount: delta,
        source: reservation.source,
        referenceId: reservation.referenceId ?? undefined,
        description: `Refund unused reservation (${delta} credits)`,
      }),
    );
    return { refunded: delta, overageUnbilled: 0 };
  }

  // actual > reserved: log but do not charge more than what was authorized.
  return { refunded: 0, overageUnbilled: -delta };
}

/** Fully refunds a reservation, e.g. when a job fails before any billable work. */
export async function refundReservation(reservationTxnId: string, tx?: Client): Promise<void> {
  const client = tx ?? prisma;
  const reservation = await client.creditTransaction.findUnique({
    where: { id: reservationTxnId },
  });
  if (!reservation || reservation.type !== "GENERATION_RESERVE") {
    throw new Error("Invalid reservation transaction");
  }
  const reservedAmount = -reservation.amount;
  await withClient(tx, (c) =>
    writeTransaction(c, {
      userId: reservation.userId,
      type: "GENERATION_REFUND",
      amount: reservedAmount,
      source: reservation.source,
      referenceId: reservation.referenceId ?? undefined,
      description: "Full refund - job failed before billable usage",
    }),
  );
}
