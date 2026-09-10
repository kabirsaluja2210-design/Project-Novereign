import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { hashPassword } from "@/server/auth/crypto";
import { createSession } from "@/server/auth/session";
import { signupSchema } from "@/server/validation/auth";
import { toErrorResponse } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { grantCredits } from "@/server/credits/ledger";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const { allowed } = await rateLimit(`signup:${ip}`, 10, 60 * 60);
    if (!allowed) {
      return NextResponse.json(
        { error: "rate_limited", message: "Too many signup attempts. Try again later." },
        { status: 429 },
      );
    }

    const body = signupSchema.parse(await req.json());

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      return NextResponse.json(
        { error: "email_taken", message: "An account with this email already exists." },
        { status: 409 },
      );
    }

    const freePlan = await prisma.plan.findUnique({ where: { key: "FREE" } });
    const passwordHash = await hashPassword(body.password);

    const user = await prisma.user.create({
      data: {
        email: body.email,
        passwordHash,
        name: body.name,
        planId: freePlan?.id,
        trialStartedAt: new Date(),
        trialCredits: freePlan?.monthlyCredits ?? 150,
      },
    });

    if (freePlan) {
      await grantCredits({
        userId: user.id,
        amount: freePlan.monthlyCredits,
        type: "SUBSCRIPTION_GRANT",
        source: "signup",
        description: `Initial ${freePlan.name} plan credit grant`,
      });
    }

    await createSession(user.id, {
      userAgent: req.headers.get("user-agent") ?? undefined,
      ipAddress: ip,
    });

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
