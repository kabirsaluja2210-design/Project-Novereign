import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireSession, requireOwnedJob } from "@/server/auth/session";
import { toErrorResponse } from "@/server/http";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const user = await requireSession();
    await requireOwnedJob(id, user.id);

    const job = await prisma.job.findUnique({
      where: { id },
      include: { steps: { orderBy: { sequence: "asc" } }, project: true },
    });

    return NextResponse.json({ job });
  } catch (error) {
    return toErrorResponse(error);
  }
}
