import { NextResponse } from "next/server";
import { prisma } from "@/server/db";

export async function GET() {
  const voices = await prisma.voice.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
  return NextResponse.json({ voices });
}
