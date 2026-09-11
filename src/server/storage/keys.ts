/** Local-storage-only helper: our storageUrl values are `/api/storage/<key>`.
 * In production (STORAGE_DRIVER=s3) media URLs would be signed S3 URLs and
 * the render worker would fetch over HTTP instead - see PROVIDERS.md. */
export function urlToLocalStorageKey(url: string): string {
  return url.replace(/^\/api\/storage\//, "");
}
