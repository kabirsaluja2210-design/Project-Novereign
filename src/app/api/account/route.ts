import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireSession, destroyCurrentSession } from "@/server/auth/session";
import { toErrorResponse } from "@/server/http";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  timezone: z.string().max(100).optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireSession();
    const body = updateSchema.parse(await req.json());
    const updated = await prisma.user.update({ where: { id: user.id }, data: body });
    return NextResponse.json({ user: { id: updated.id, name: updated.name, timezone: updated.timezone } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

// Account deletion (directive §2/§64/§129). This is a soft delete (status
// DELETED + email scrambled so it can be re-registered) rather than a hard
// row + storage delete - a background cleanup job that hard-deletes rows and
// their object-storage files after a retention window is the honest
// follow-up, tracked in CLAUDE_PROGRESS.md.
export async function DELETE() {
  try {
    const user = await requireSession();
    await prisma.user.update({ where: { id: user.id }, data: { status: "DELETED", email: `deleted+${user.id}@clipforge.invalid` } });
    await destroyCurrentSession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
