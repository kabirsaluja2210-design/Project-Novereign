/**
 * Baseline prompt moderation (directive §63). This is a denylist check, not
 * an ML classifier - it exists so the endpoint isn't wide open, but it is
 * explicitly NOT sufficient for production content moderation. See
 * PRODUCT_SPEC.md roadmap: a real moderation provider (e.g. an LLM
 * moderation endpoint) is the follow-up.
 *
 * Deliberately narrow: normal horror/thriller fiction, violence-in-fiction,
 * and dark themes are allowed - only clearly disallowed categories are
 * blocked (directive §63 warns against over-blocking normal horror/fiction).
 */
const DISALLOWED_PATTERNS: RegExp[] = [
  /\bchild\s+sexual\b/i,
  /\bhow to (make|build) a bomb\b/i,
  /\bhow to synthesize\b.*\b(nerve agent|sarin|ricin)\b/i,
  /\bcredible threat\b.*\b(kill|attack)\b/i,
];

export interface ModerationResult {
  allowed: boolean;
  reason?: string;
}

export function checkPromptModeration(text: string): ModerationResult {
  for (const pattern of DISALLOWED_PATTERNS) {
    if (pattern.test(text)) {
      return { allowed: false, reason: "This idea violates our content policy." };
    }
  }
  return { allowed: true };
}
