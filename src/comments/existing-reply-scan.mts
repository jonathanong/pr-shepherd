import type { RepoInfo } from "../github/client.mts";
import { readReplyRecoveryEvidence } from "../github/reply-recovery-read.mts";
import { durableStateRequested } from "../state/durable-state.mts";
import { addPrShepherdMarker } from "./marker.mts";

const BATCH = 10;

/**
 * Threads whose last comment is already this exact Shepherd reply from the authenticated viewer.
 *
 * A cloud session can lose its state directory between ticks, taking the uncertain-reply
 * records with it. With no local record to consult, GitHub is the only evidence of whether a
 * reply already landed, so durable-state sessions check it before posting. A failed read
 * never blocks the reply: it only means this safeguard had nothing to say.
 */
export async function findExistingReplies(
  context: { repo: RepoInfo; pr: number },
  ids: readonly string[],
  message: string,
): Promise<string[]> {
  if (ids.length === 0 || !durableStateRequested()) return [];
  const marked = addPrShepherdMarker(message);
  const found: string[] = [];
  for (let offset = 0; offset < ids.length; offset += BATCH) {
    const batch = ids.slice(offset, offset + BATCH);
    try {
      const evidence = await readReplyRecoveryEvidence(context.repo, context.pr, batch);
      for (const id of batch) {
        const item = evidence.get(id);
        const last = item?.comments.at(-1);
        if (
          item &&
          last?.body === marked &&
          last.author?.toLowerCase() === item.viewer.toLowerCase()
        ) {
          found.push(id);
        }
      }
    } catch {
      /* Evidence is advisory here; the normal reply path still runs. */
    }
  }
  return found;
}
