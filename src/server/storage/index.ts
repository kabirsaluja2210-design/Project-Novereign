import { promises as fs } from "fs";
import path from "path";

/**
 * Object storage abstraction (directive §30). Dev/local uses disk under
 * STORAGE_LOCAL_DIR, served back through /api/storage/[...key]. Swapping in
 * S3/R2/B2 means implementing this interface against the AWS SDK and
 * flipping STORAGE_DRIVER=s3 - nothing above this layer changes.
 */
export interface ObjectStorage {
  put(key: string, data: Buffer, contentType: string): Promise<string>;
  getLocalFsPath(key: string): string;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

class LocalDiskStorage implements ObjectStorage {
  private baseDir: string;
  private baseUrl: string;

  constructor() {
    this.baseDir = path.resolve(process.cwd(), process.env.STORAGE_LOCAL_DIR ?? "./storage");
    this.baseUrl = "/api/storage";
  }

  private resolveKey(key: string): string {
    const normalized = path.normalize(key).replace(/^(\.\.[/\\])+/, "");
    return path.join(this.baseDir, normalized);
  }

  getLocalFsPath(key: string): string {
    return this.resolveKey(key);
  }

  async put(key: string, data: Buffer, _contentType: string): Promise<string> {
    const fullPath = this.resolveKey(key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, data);
    return `${this.baseUrl}/${key}`;
  }

  async read(key: string): Promise<Buffer> {
    return fs.readFile(this.resolveKey(key));
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolveKey(key), { force: true });
  }
}

let storageInstance: ObjectStorage | null = null;

export function getStorage(): ObjectStorage {
  if (!storageInstance) {
    const driver = process.env.STORAGE_DRIVER ?? "local";
    if (driver === "s3") {
      throw new Error(
        "STORAGE_DRIVER=s3 requires an S3 adapter implementation - see PROVIDERS.md. " +
          "Set STORAGE_DRIVER=local for development.",
      );
    }
    storageInstance = new LocalDiskStorage();
  }
  return storageInstance;
}

export function storageKeyToUrl(key: string): string {
  return `/api/storage/${key}`;
}
