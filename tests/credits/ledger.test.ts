import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import {
  grantCredits,
  reserveCredits,
  settleGeneration,
  refundReservation,
} from "@/server/credits/ledger";
import { InsufficientCreditsError } from "@/server/errors";

/**
 * Integration tests against the real Postgres instance configured via
 * DATABASE_URL (see TESTING.md - this sandbox has no separate test database
 * wired up yet, so these run against the dev DB using disposable throwaway
 * users cleaned up in afterAll). They exercise actual `SELECT ... FOR
 * UPDATE` row locking and transactional writes, not a mocked Prisma client.
 */

let userId: string;

beforeEach(async () => {
  const user = await prisma.user.create({
    data: { email: `ledger-test-${Date.now()}-${Math.random()}@example.com`, creditBalance: 0 },
  });
  userId = user.id;
});

afterAll(async () => {
  await prisma.creditTransaction.deleteMany({ where: { user: { email: { contains: "ledger-test-" } } } });
  await prisma.user.deleteMany({ where: { email: { contains: "ledger-test-" } } });
  await prisma.$disconnect();
});

describe("credit ledger", () => {
  it("grants credits and updates the denormalized balance atomically", async () => {
    await grantCredits({ userId, amount: 100, type: "SUBSCRIPTION_GRANT", source: "test" });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.creditBalance).toBe(100);

    const txns = await prisma.creditTransaction.findMany({ where: { userId } });
    expect(txns).toHaveLength(1);
    expect(txns[0]!.balanceAfter).toBe(100);
  });

  it("never allows the balance to go negative", async () => {
    await grantCredits({ userId, amount: 10, type: "SUBSCRIPTION_GRANT", source: "test" });
    await expect(
      reserveCredits({ userId, amount: 50, source: "test" }),
    ).rejects.toBeInstanceOf(InsufficientCreditsError);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.creditBalance).toBe(10); // unchanged - the failed reservation wrote nothing
  });

  it("reserve -> settle (actual less than reserved) refunds the unused difference", async () => {
    await grantCredits({ userId, amount: 100, type: "SUBSCRIPTION_GRANT", source: "test" });
    const { reservationTxnId } = await reserveCredits({ userId, amount: 40, source: "test" });

    let user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.creditBalance).toBe(60);

    const result = await settleGeneration({ reservationTxnId, actualAmount: 25 });
    expect(result.refunded).toBe(15);

    user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.creditBalance).toBe(75); // 100 - 25 actual
  });

  it("reserve -> settle (actual equals reserved) makes no additional transaction", async () => {
    await grantCredits({ userId, amount: 50, type: "SUBSCRIPTION_GRANT", source: "test" });
    const { reservationTxnId } = await reserveCredits({ userId, amount: 30, source: "test" });
    const result = await settleGeneration({ reservationTxnId, actualAmount: 30 });
    expect(result.refunded).toBe(0);
    expect(result.overageUnbilled).toBe(0);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.creditBalance).toBe(20);
  });

  it("never overcharges beyond the reservation even if actual cost is higher", async () => {
    await grantCredits({ userId, amount: 50, type: "SUBSCRIPTION_GRANT", source: "test" });
    const { reservationTxnId } = await reserveCredits({ userId, amount: 30, source: "test" });
    const result = await settleGeneration({ reservationTxnId, actualAmount: 45 });
    expect(result.overageUnbilled).toBe(15);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.creditBalance).toBe(20); // still only the reserved 30 was ever charged
  });

  it("fully refunds a reservation when a job fails before any billable work", async () => {
    await grantCredits({ userId, amount: 50, type: "SUBSCRIPTION_GRANT", source: "test" });
    const { reservationTxnId } = await reserveCredits({ userId, amount: 30, source: "test" });
    await refundReservation(reservationTxnId);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.creditBalance).toBe(50);
  });

  it("keeps the ledger append-only: every mutation adds a row, none are edited", async () => {
    await grantCredits({ userId, amount: 100, type: "SUBSCRIPTION_GRANT", source: "test" });
    const { reservationTxnId } = await reserveCredits({ userId, amount: 20, source: "test" });
    await settleGeneration({ reservationTxnId, actualAmount: 10 });

    const txns = await prisma.creditTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
    expect(txns.map((t) => t.type)).toEqual([
      "SUBSCRIPTION_GRANT",
      "GENERATION_RESERVE",
      "GENERATION_SETTLEMENT",
    ]);
    // balanceAfter is a strictly-derived running total, never mutated after creation
    expect(txns[0]!.balanceAfter).toBe(100);
    expect(txns[1]!.balanceAfter).toBe(80);
    expect(txns[2]!.balanceAfter).toBe(90);
  });

  it("handles concurrent reservations without double-spending (row lock)", async () => {
    await grantCredits({ userId, amount: 100, type: "SUBSCRIPTION_GRANT", source: "test" });

    const attempts = await Promise.allSettled([
      reserveCredits({ userId, amount: 60, source: "test" }),
      reserveCredits({ userId, amount: 60, source: "test" }),
    ]);

    const succeeded = attempts.filter((a) => a.status === "fulfilled");
    const failed = attempts.filter((a) => a.status === "rejected");
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.creditBalance).toBe(40); // only one 60-credit reservation ever succeeded
  });
});
