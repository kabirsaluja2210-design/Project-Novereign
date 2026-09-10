import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { verifyPassword } from "@/server/auth/crypto";
import { createSession } from "@/server/auth/session";
import { loginSchema } from "@/server/validation/auth";
import { toErrorResponse } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const { allowed } = await rateLimit(`login:${ip}`, 20, 15 * 60);
    if (!allowed) {
      return NextResponse.json(
        { error: "rate_limited", message: "Too many login attempts. Try again later." },
        { status: 429 },
      );
    }

    const body = loginSchema.parse(await req.json());
    const user = await prisma.user.findUnique({ where: { email: body.email } });

    // Constant-shaped response whether the account exists or not, to avoid
    // leaking which emails are registered.
    const genericError = NextResponse.json(
      { error: "invalid_credentials", message: "Invalid email or password." },
      { status: 401 },
    );

    if (!user || !user.passwordHash) return genericError;
    if (user.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "account_disabled", message: "This account is disabled." },
        { status: 403 },
      );
    }

    const valid = await verifyPassword(body.password, user.passwordHash);
    if (!valid) return genericError;

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
