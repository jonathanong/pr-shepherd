import { graphql } from "../../github/client.mts";
import { UPPER_LAYER_CONFLICT_TARGET_QUERY } from "../../github/queries.mts";
import { pollRateLimitRetryAfterMs } from "../poll-quota.mts";

/** An upper layer already contains its parent, so the dirty state is against trunk. */
export interface UpperLayerTrunkConflict {
  trunk: string;
  /** Open layer whose PR base is the trunk. Omitted when that layer is not on this page. */
  bottomPr?: number;
}

interface StackEntryNode {
  position: number;
  pullRequest: { number: number; state: string; baseRefName: string } | null;
}

interface ConflictTargetData {
  repository: {
    pullRequest: {
      baseRef: { compare: { behindBy: number } | null } | null;
      stack: {
        entries: {
          pageInfo: { hasNextPage: boolean };
          nodes: Array<StackEntryNode | null>;
        };
      } | null;
    } | null;
  } | null;
}

/** Lowest-position open layer whose base is the stack trunk, if this page contains one. */
function selectBottomOpenLayer(
  nodes: ReadonlyArray<StackEntryNode | null>,
  trunk: string,
): number | undefined {
  const onTrunk = nodes.flatMap((node) => {
    const pull = node?.pullRequest;
    if (!node || !pull || pull.state !== "OPEN" || pull.baseRefName !== trunk) return [];
    return [{ position: node.position, number: pull.number }];
  });
  onTrunk.sort((a, b) => a.position - b.position);
  return onTrunk[0]?.number;
}

export async function lookupUpperLayerTrunkConflict(input: {
  owner: string;
  name: string;
  pr: number;
  headRef: string;
  trunk: string;
}): Promise<UpperLayerTrunkConflict | undefined> {
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
  const entries = pull.stack?.entries;
  const bottomPr = entries ? selectBottomOpenLayer(entries.nodes, input.trunk) : undefined;
  if (bottomPr === undefined) {
    ignore(
      input.pr,
      entries?.pageInfo.hasNextPage
        ? "stack entry page truncated before the trunk layer"
        : "bottom open layer not found",
    );
  }
  return { trunk: input.trunk, ...(bottomPr !== undefined && { bottomPr }) };
}

function ignore(pr: number, message: string): void {
  process.stderr.write(
    `pr-shepherd: upper-layer conflict target unavailable for PR #${pr} (ignored): ${message}\n`,
  );
}
