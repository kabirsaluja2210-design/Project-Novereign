// URL <-> storage-key mapping for the local-disk storage driver. Kept
// separate from index.ts (which touches `fs`) so callers that only need to
// go from a stored URL back to a key - e.g. the render pipeline reading
// scene assets back off disk - don't need to pull in filesystem code.

const APP_BASE_URL = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const STORAGE_URL_PREFIX = "/api/storage/";

export function storageKeyToUrl(key: string): string {
  return `${APP_BASE_URL}${STORAGE_URL_PREFIX}${key}`;
}

export function urlToLocalStorageKey(url: string): string {
  const idx = url.indexOf(STORAGE_URL_PREFIX);
  if (idx === -1) {
    throw new Error(`Cannot resolve a local storage key from URL: ${url}`);
  }
  return decodeURIComponent(url.slice(idx + STORAGE_URL_PREFIX.length));
}
