import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireSession, ForbiddenError } from "@/server/auth/session";
import { toErrorResponse } from "@/server/http";

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const user = await requireSession();
    const character = await prisma.character.findFirst({ where: { id, userId: user.id } });
    if (!character) throw new ForbiddenError("Character not found or not owned by this user");
    await prisma.character.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
