import { NextResponse } from "next/server";
import { requireSession, destroyAllSessions, destroyCurrentSession } from "@/server/auth/session";
import { toErrorResponse } from "@/server/http";

export async function POST() {
  try {
    const user = await requireSession();
    await destroyAllSessions(user.id);
    await destroyCurrentSession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
