import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireSession } from "@/server/auth/session";
import { createCharacterSchema } from "@/server/validation/character";
import { toErrorResponse } from "@/server/http";

export async function GET() {
  try {
    const user = await requireSession();
    const characters = await prisma.character.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ characters });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireSession();
    const body = createCharacterSchema.parse(await req.json());
    const character = await prisma.character.create({
      data: { ...body, userId: user.id },
    });
    return NextResponse.json({ character }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
