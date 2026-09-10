import { promises as fs } from "fs";
import path from "path";
import { storageKeyToUrl } from "./keys";

export { storageKeyToUrl } from "./keys";

export interface ObjectStorage {
  /** Writes `data` under `key` and returns the public URL it can be fetched from. */
  put(key: string, data: Buffer, contentType: string): Promise<string>;
  /** Reads back the bytes previously written under `key`. */
  read(key: string): Promise<Buffer>;
}

// Local-disk driver used in dev and in the single-host docker-compose setup
// (directive §30 - binaries never go in Postgres). See ARCHITECTURE.md's
// Storage row and docker-compose.yml's `media_storage` volume, which is what
// lets the web and worker containers share these files.
class LocalDiskStorage implements ObjectStorage {
  constructor(private readonly rootDir: string) {}

  async put(key: string, data: Buffer): Promise<string> {
    const filePath = path.join(this.rootDir, key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);
    return storageKeyToUrl(key);
  }

  async read(key: string): Promise<Buffer> {
    return fs.readFile(path.join(this.rootDir, key));
  }
}

let cached: ObjectStorage | undefined;

export function getStorage(): ObjectStorage {
  if (cached) return cached;

  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver !== "local") {
    // S3-compatible driver is on the roadmap (see .env.example's STORAGE_*
    // vars) but not implemented yet - only local disk is wired up.
    throw new Error(
      `STORAGE_DRIVER="${driver}" is not implemented yet - only "local" is currently supported.`,
    );
  }

  cached = new LocalDiskStorage(process.env.STORAGE_LOCAL_DIR ?? "./storage");
  return cached;
}
