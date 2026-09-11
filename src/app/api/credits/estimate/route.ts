import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { estimateCredits } from "@/server/credits/estimate";
import { toErrorResponse } from "@/server/http";

const schema = z.object({
  durationSec: z.number().int().min(15).max(1800),
  captionsEnabled: z.boolean().default(true),
  musicEnabled: z.boolean().default(false),
  sfxEnabled: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  try {
    await requireSession();
    const body = schema.parse(await req.json());
    const estimate = estimateCredits(body);
    return NextResponse.json({ estimate });
  } catch (error) {
    return toErrorResponse(error);
  }
}
