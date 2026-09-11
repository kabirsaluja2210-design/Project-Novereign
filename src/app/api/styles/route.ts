import { NextResponse } from "next/server";
import { prisma } from "@/server/db";

export async function GET() {
  const styles = await prisma.style.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
  return NextResponse.json({ styles });
}
