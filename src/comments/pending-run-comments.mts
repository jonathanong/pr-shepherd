import type { RepoInfo } from "../github/client.mts";
import { readRest } from "../github/rest-reader-core.mts";
import { classifyItem, type SeenMarker } from "../state/seen-comments.mts";
import type { PendingRunComment, PrComment } from "../types.mts";
import { isConfiguredBotAuthor, type NormalizedBotUsernames } from "./authors.mts";

/**
 * Workflow events that a comment or review triggers. A mention bot's run (for example
 * claude-code-action answering `@claude`) starts from one of these; the PR's own CI run
 * (`pull_request`, `push`, `merge_group`) does not, so a bot comment that only links CI is never held.
 */
const COMMENT_TRIGGER_EVENTS: ReadonlySet<string> = new Set([
  "issue_comment",
  "pull_request_review_comment",
  "pull_request_review",
]);

/** Run lookups per tick. The newest candidates win; the rest surface as ordinary comments. */
const MAX_RUN_LOOKUPS = 5;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The Actions run ID a comment body links within this repository, or `undefined`. */
function linkedRunId(body: string, repo: RepoInfo): string | undefined {
  const pattern = new RegExp(
    `https?://[^/\\s]+/${escapeRegExp(repo.owner)}/${escapeRegExp(repo.name)}/actions/runs/(\\d+)`,
    "i",
  );
  return pattern.exec(body)?.[1];
}

async function readRunState(
  runId: string,
  repo: RepoInfo,
): Promise<{ status?: unknown; event?: unknown } | undefined> {
  try {
    return await readRest<{ status?: unknown; event?: unknown }>(
      "GET",
      `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/actions/runs/${runId}`,
    );
  } catch {
    // An unreadable run never hides a comment: it surfaces as an ordinary comment.
    return undefined;
  }
}

/**
 * A visible bot comment that links a comment-triggered Actions run of this repository that GitHub
 * reports as not completed is a placeholder the bot will edit into its result. Returns those
 * comments, keyed by comment ID. Unchanged seen comments are skipped (nothing to hold), and a
 * failed run lookup leaves the comment out of the result.
 */
export async function findPendingRunComments(
  comments: readonly PrComment[],
  repo: RepoInfo,
  seenMap: Map<string, SeenMarker>,
  botUsernames: NormalizedBotUsernames,
): Promise<Map<string, PendingRunComment>> {
  const candidates = comments
    .filter(
      (c) =>
        !c.isMinimized &&
        isConfiguredBotAuthor(c, botUsernames) &&
        classifyItem(c.id, c.body, seenMap) !== "unchanged",
    )
    .flatMap((c) => {
      const runId = linkedRunId(c.body, repo);
      return runId === undefined ? [] : [{ comment: c, runId }];
    })
    .sort((a, b) => b.comment.createdAtUnix - a.comment.createdAtUnix)
    .slice(0, MAX_RUN_LOOKUPS);
  const runIds = [...new Set(candidates.map((c) => c.runId))];
  const states = new Map(
    await Promise.all(runIds.map(async (id) => [id, await readRunState(id, repo)] as const)),
  );
  const pending = new Map<string, PendingRunComment>();
  for (const { comment, runId } of candidates) {
    const state = states.get(runId);
    if (typeof state?.status !== "string" || state.status === "completed") continue;
    if (typeof state.event !== "string" || !COMMENT_TRIGGER_EVENTS.has(state.event)) continue;
    pending.set(comment.id, {
      id: comment.id,
      author: comment.author,
      url: comment.url,
      runId,
      runStatus: state.status,
    });
  }
  return pending;
}
