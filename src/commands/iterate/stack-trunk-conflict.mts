import { graphql } from "../../github/client.mts";
import { readStackTopology } from "../../github/stack-read.mts";
import { UPPER_LAYER_CONFLICT_TARGET_QUERY } from "../../github/queries.mts";
import { pollRateLimitRetryAfterMs } from "../poll-quota.mts";

/** A bottom open layer, or an upper layer that already contains its parent, updates from trunk. */
export interface UpperLayerTrunkConflict {
  trunk: string;
  /** First open layer in validated stack order. Omitted when topology is unavailable. */
  bottomPr?: number;
}

interface ConflictTargetData {
  repository: {
    pullRequest: {
      baseRef: { compare: { behindBy: number } | null } | null;
    } | null;
  } | null;
}

export async function lookupUpperLayerTrunkConflict(input: {
  owner: string;
  name: string;
  pr: number;
  headRef: string;
  trunk: string;
  /** Reuse the bottom layer already resolved for the report, avoiding a topology fetch. */
  bottomPr?: number;
}): Promise<UpperLayerTrunkConflict | undefined> {
  let bottomPr = input.bottomPr;
  if (bottomPr === undefined) {
    try {
      const topology = await readStackTopology(input.pr, { owner: input.owner, name: input.name });
      bottomPr = topology.ordered.find((pull) => pull.state === "OPEN")?.number;
      if (bottomPr === undefined) ignore(input.pr, "bottom open layer not found");
    } catch (err) {
      if (pollRateLimitRetryAfterMs(err) !== null) throw err;
      ignore(input.pr, err instanceof Error ? err.message : String(err));
    }
  }
  // Merged lower layers need not cause GitHub to retarget this PR to trunk. Even when its
  // head is behind that old parent branch, the first open layer rebases the stack onto trunk.
  if (bottomPr === input.pr) return { trunk: input.trunk, bottomPr };

  let data: ConflictTargetData;
  try {
    ({ data } = await graphql<ConflictTargetData>(UPPER_LAYER_CONFLICT_TARGET_QUERY, {
      owner: input.owner,
      name: input.name,
      number: input.pr,
      headRef: input.headRef,
    }));
  } catch (err) {
    if (pollRateLimitRetryAfterMs(err) !== null) throw err;
    ignore(input.pr, err instanceof Error ? err.message : String(err));
    return undefined;
  }
  const pull = data.repository?.pullRequest;
  const behindBy = pull?.baseRef?.compare?.behindBy;
  if (!pull || behindBy == null) {
    ignore(input.pr, pull ? "base comparison unavailable" : "pull request not found");
    return undefined;
  }
  // behindBy > 0: the layer is still behind its parent. Keep the parent rebase.
  if (behindBy !== 0) return undefined;
  return { trunk: input.trunk, ...(bottomPr !== undefined && { bottomPr }) };
}

function ignore(pr: number, message: string): void {
  process.stderr.write(
    `pr-shepherd: upper-layer conflict target unavailable for PR #${pr} (ignored): ${message}\n`,
  );
}
