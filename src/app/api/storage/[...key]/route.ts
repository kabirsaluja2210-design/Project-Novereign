import { NextResponse } from "next/server";
import path from "path";
import { getStorage } from "@/server/storage";

// Generated media (rendered videos, scene images/audio, thumbnails) served
// straight off the shared `media_storage` volume (see docker-compose.yml).
// Keys are unguessable (content-hash/timestamp based, never sequential), so
// this intentionally isn't gated behind a session the way project/job routes
// are - the same model S3's public-object URLs use.
const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".srt": "text/plain; charset=utf-8",
};

export async function GET(_req: Request, context: { params: Promise<{ key: string[] }> }) {
  const { key: segments } = await context.params;

  // Reject anything that could escape the storage root once joined.
  if (segments.length === 0 || segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const key = segments.join("/");

  try {
    const storage = getStorage();
    const data = await storage.read(key);
    const contentType = CONTENT_TYPES[path.extname(key).toLowerCase()] ?? "application/octet-stream";
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
