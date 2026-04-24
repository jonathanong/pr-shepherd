import type { AgentThread, AgentComment, Review, ResolveCommand } from "../../types.mts";
import type { AgentCheck } from "../../types.mts";

// Logins treated as bot authors regardless of the GitHub Bot/User user type.
// Mirrors plugin/skills/resolve/SKILL.md §3 — kept in sync with the resolve triage guidance.
const KNOWN_BOT_LOGINS = new Set([
  "copilot-pull-request-reviewer",
  "gemini-code-assist",
  "coderabbitai",
]);

function isBotAuthor(login: string): boolean {
  const bare = login.replace(/\[bot\]$/, "");
  if (bare !== login) return true;
  return KNOWN_BOT_LOGINS.has(bare);
}

export function classifyReviewSummaries(
  summaries: Review[],
  approvals: Review[],
  cfg: { bots: boolean; humans: boolean; approvals: boolean },
): { minimizeIds: string[]; surfacedSummaries: Review[] } {
  const minimizeIds: string[] = [];
  const surfacedSummaries: Review[] = [];
  for (const r of summaries) {
    const enabled = isBotAuthor(r.author) ? cfg.bots : cfg.humans;
    if (enabled) minimizeIds.push(r.id);
    else surfacedSummaries.push(r);
  }
  if (cfg.approvals) {
    for (const r of approvals) minimizeIds.push(r.id);
  }
  return { minimizeIds, surfacedSummaries };
}

// Patterns that indicate a comment is bot-generated noise rather than actionable feedback.
// Conservative: only match explicit known patterns to avoid accidentally suppressing real reviews.
const NOISE_PATTERNS = [
  /you have reached your daily quota/i,
  /please wait up to \d+ hours?/i,
  /rate[\s-]?limit(?:ed)?\s*[-—:]\s*try again/i,
  /resuming (monitoring|watch|checking)/i,
  /restarting (monitoring|watch)/i,
];

function isNoiseComment(comment: AgentComment): boolean {
  return NOISE_PATTERNS.some((p) => p.test(comment.body));
}

export function classifyComments(comments: AgentComment[]): {
  actionable: AgentComment[];
  noiseIds: string[];
} {
  const actionable: AgentComment[] = [];
  const noiseIds: string[] = [];
  for (const c of comments) {
    if (isNoiseComment(c)) {
      noiseIds.push(c.id);
    } else {
      actionable.push(c);
    }
  }
  return { actionable, noiseIds };
}

export function buildResolveCommand(
  threads: AgentThread[],
  actionableComments: AgentComment[],
  allCommentIds: string[],
  reviews: Review[],
  checks: AgentCheck[],
  prNumber: number,
): ResolveCommand {
  const argv = ["npx", "pr-shepherd", "resolve", String(prNumber)];

  if (threads.length > 0) {
    argv.push("--resolve-thread-ids", threads.map((t) => t.id).join(","));
  }
  if (allCommentIds.length > 0) {
    argv.push("--minimize-comment-ids", allCommentIds.join(","));
  }
  const hasDismiss = reviews.length > 0;
  if (hasDismiss) {
    argv.push("--dismiss-review-ids", reviews.map((r) => r.id).join(","));
    argv.push("--message", "$DISMISS_MESSAGE");
  }

  // A push happens when there is code to change — threads, actionable comments, CI checks, or reviews.
  // Noise-only comment minimization skips commit/push, so requiresHeadSha must be false.
  const requiresHeadSha =
    threads.length > 0 || actionableComments.length > 0 || checks.length > 0 || reviews.length > 0;

  // hasMutations = we appended at least one of --resolve-thread-ids,
  // --minimize-comment-ids, or --dismiss-review-ids. Returned explicitly
  // (rather than derived from argv.length) so callers don't couple to the
  // base-argv shape.
  const hasMutations = threads.length > 0 || allCommentIds.length > 0 || reviews.length > 0;

  return { argv, requiresHeadSha, requiresDismissMessage: hasDismiss, hasMutations };
}
