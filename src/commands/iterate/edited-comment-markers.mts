import { markSeen } from "../../state/seen-comments.mts";
import type { IterateResult } from "../../types.mts";

/** Records the edited comments a result shows, so each edit is shown once. Returns the result. */
export async function markEditedCommentsSeen(result: IterateResult): Promise<IterateResult> {
  const [owner, repo] = result.repo.split("/");
  if (!result.editedComments?.length || !owner || !repo) return result;
  const key = { owner, repo, pr: result.pr };
  await Promise.allSettled(result.editedComments.map((c) => markSeen(key, c.id, c.body)));
  return result;
}
