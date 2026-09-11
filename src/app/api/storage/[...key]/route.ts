import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { getStorage } from "@/server/storage";

const CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".srt": "text/plain",
  ".vtt": "text/vtt",
};

// NOTE: dev-only local storage. In production this route is unused because
// STORAGE_DRIVER=s3 serves signed URLs directly from the bucket - see
// ARCHITECTURE.md §Storage and PROVIDERS.md.
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ key: string[] }> },
) {
  const { key: keyParts } = await context.params;
  const key = keyParts.join("/");
  const storage = getStorage();
  const fsPath = storage.getLocalFsPath(key);

  try {
    const data = await fs.readFile(fsPath);
    const ext = key.slice(key.lastIndexOf(".")).toLowerCase();
    const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
