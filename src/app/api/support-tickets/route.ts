import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireSession } from "@/server/auth/session";
import { toErrorResponse } from "@/server/http";

const schema = z.object({
  subject: z.string().min(3).max(200),
  category: z.string().max(100).optional(),
  message: z.string().min(10).max(5000),
});

export async function GET() {
  try {
    const user = await requireSession();
    const tickets = await prisma.supportTicket.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ tickets });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireSession();
    const body = schema.parse(await req.json());
    const ticket = await prisma.supportTicket.create({ data: { ...body, userId: user.id } });
    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
