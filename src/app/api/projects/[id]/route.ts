import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireSession, requireOwnedProject } from "@/server/auth/session";
import { toErrorResponse } from "@/server/http";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const user = await requireSession();
    await requireOwnedProject(id, user.id);

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        scenes: { orderBy: { index: "asc" }, include: { media: true, voiceSegment: true } },
        jobs: { orderBy: { createdAt: "desc" }, take: 1, include: { steps: true } },
      },
    });

    return NextResponse.json({ project });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const user = await requireSession();
    await requireOwnedProject(id, user.id);
    await prisma.project.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
