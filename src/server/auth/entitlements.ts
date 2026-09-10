import type { User } from "@prisma/client";
import { prisma } from "@/server/db";

/**
 * Plan entitlement engine (directive §227). Never scatter `if (plan === "pro")`
 * through the app - route every feature gate through `can()`.
 */
export type Entitlement =
  | "AUTOMATION"
  | "LONG_VIDEO"
  | "SOCIAL_INSTAGRAM"
  | "THREE_D"
  | "VOICE_CLONING"
  | "MULTIPLE_ACCOUNTS";

export async function can(user: User, entitlement: Entitlement): Promise<boolean> {
  if (!user.planId) return false;
  const plan = await prisma.plan.findUnique({ where: { id: user.planId } });
  if (!plan || !plan.isActive) return false;
  const entitlements = (plan.entitlements as Record<string, boolean>) ?? {};
  return Boolean(entitlements[entitlement]);
}

export async function maxVideoDurationSec(user: User): Promise<number> {
  if (!user.planId) return 60;
  const plan = await prisma.plan.findUnique({ where: { id: user.planId } });
  return plan?.maxVideoDurationSec ?? 60;
}
