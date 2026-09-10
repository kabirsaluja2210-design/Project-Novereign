import { NextResponse } from "next/server";
import { prisma } from "@/server/db";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const template = await prisma.template.findUnique({ where: { id } });
  return NextResponse.json({ template });
}
