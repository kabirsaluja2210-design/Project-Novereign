/**
 * Single source of truth for product branding. Change these to rebrand —
 * nothing else in the codebase should hard-code the product name.
 */
export const brand = {
  name: process.env.NEXT_PUBLIC_APP_NAME ?? "ClipForge AI",
  tagline: "From idea to publish-ready video.",
} as const;
