import { prisma } from "@/server/db";
import { getCurrentUser } from "@/server/auth/session";
import { Card, CardBody } from "@/components/ui/card";

export default async function BillingPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const [plan, transactions] = await Promise.all([
    user.planId ? prisma.plan.findUnique({ where: { id: user.planId } }) : null,
    prisma.creditTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Billing</h1>

      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm text-muted">Current plan</div>
            <div className="text-lg font-semibold">{plan?.name ?? "Free"}</div>
          </div>
          <div>
            <div className="text-sm text-muted">Credit balance</div>
            <div className="text-lg font-semibold">{user.creditBalance.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-sm text-muted">Monthly credit grant</div>
            <div className="text-lg font-semibold">{plan?.monthlyCredits.toLocaleString() ?? "-"}</div>
          </div>
        </CardBody>
      </Card>

      <p className="text-sm text-muted">
        Plan upgrades and payment are not wired up in this build (no Stripe integration yet - see
        BILLING.md). Credit grants, reservations, settlements, and refunds below are real and drive
        actual generation limits.
      </p>

      <Card>
        <CardBody>
          <h2 className="mb-4 font-semibold">Credit history</h2>
          {transactions.length === 0 ? (
            <p className="text-sm text-muted">No transactions yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted">
                    <th className="pb-2 font-medium">Date</th>
                    <th className="pb-2 font-medium">Type</th>
                    <th className="pb-2 font-medium">Description</th>
                    <th className="pb-2 text-right font-medium">Amount</th>
                    <th className="pb-2 text-right font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => (
                    <tr key={t.id} className="border-b border-border/50">
                      <td className="py-2 text-muted">{t.createdAt.toLocaleDateString()}</td>
                      <td className="py-2">{t.type.replace(/_/g, " ").toLowerCase()}</td>
                      <td className="py-2 text-muted">{t.description}</td>
                      <td className={`py-2 text-right ${t.amount < 0 ? "text-danger" : "text-success"}`}>
                        {t.amount > 0 ? "+" : ""}
                        {t.amount}
                      </td>
                      <td className="py-2 text-right">{t.balanceAfter}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
