import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireSession } from "@/server/auth/session";
import { maxVideoDurationSec } from "@/server/auth/entitlements";
import { createProjectSchema } from "@/server/validation/project";
import { checkPromptModeration } from "@/server/moderation/check";
import { toErrorResponse } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

export async function GET() {
  try {
    const user = await requireSession();
    const projects = await prisma.project.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        status: true,
        aspectRatio: true,
        durationSec: true,
        thumbnailUrl: true,
        finalVideoUrl: true,
        creditEstimate: true,
        creditActual: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json({ projects });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireSession();

    const { allowed } = await rateLimit(`create_project:${user.id}`, 30, 60 * 60);
    if (!allowed) {
      return NextResponse.json(
        { error: "rate_limited", message: "Too many projects created recently. Try again later." },
        { status: 429 },
      );
    }

    const body = createProjectSchema.parse(await req.json());

    const moderation = checkPromptModeration(body.idea);
    if (!moderation.allowed) {
      return NextResponse.json(
        { error: "content_policy", message: moderation.reason },
        { status: 422 },
      );
    }

    const allowedMaxDuration = await maxVideoDurationSec(user);
    if (body.durationSec > allowedMaxDuration) {
      return NextResponse.json(
        {
          error: "duration_not_allowed",
          message: `Your plan supports videos up to ${allowedMaxDuration} seconds. Upgrade to create longer videos.`,
        },
        { status: 403 },
      );
    }

    const style = body.styleKey
      ? await prisma.style.findUnique({ where: { key: body.styleKey } })
      : null;

    const project = await prisma.project.create({
      data: {
        userId: user.id,
        name: body.idea.slice(0, 80),
        idea: body.idea,
        aspectRatio: body.aspectRatio,
        durationSec: body.durationSec,
        language: body.language,
        styleId: style?.id,
        voiceId: body.voiceId,
        captionsEnabled: body.captionsEnabled,
        musicEnabled: body.musicEnabled,
        sfxEnabled: body.sfxEnabled,
        status: "DRAFT",
      },
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
