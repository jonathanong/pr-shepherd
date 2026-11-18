import type { PollSummaryItem, PollSummaryResult } from "../types.mts";
import { buildNativeStackRebaseInstruction } from "./iterate/native-stack-rebase.mts";
import { openLayers } from "./stack-merge-scope.mts";

/**
 * The read-only trunk check printed before a stack merge whose top layer is not the bottom one.
 * GitHub's per-layer `mergeable` compares an upper layer only with its parent, so trunk commits
 * that conflict with the top head are invisible until the atomic merge fails. The CLI cannot
 * fetch, so the caller runs `git merge-tree`, which writes nothing to the work tree or refs.
 * Present only when Shepherd saw trunk ahead of the head (`trunkBehindBy`) or could not compare
 * (`trunkBehindUnknown`); otherwise the merge step stays as it was.
 */
export function trunkPreCheck(result: PollSummaryResult, top: PollSummaryItem): string | undefined {
  if (!top.trunkBehindBy && !top.trunkBehindUnknown) return undefined;
  const stack = top.stack!;
  const trunk = stack.baseRefName;
  const bottom = openLayers(result)[0] ?? top;
  const why = top.trunkBehindBy
    ? `Trunk \`${trunk}\` has ${top.trunkBehindBy} commit${top.trunkBehindBy === 1 ? "" : "s"} that PR #${top.pr} lacks`
    : `Shepherd could not compare trunk \`${trunk}\` with PR #${top.pr}`;
  const rebase = buildNativeStackRebaseInstruction(result.repo, stack.number, {
    bottomPr: bottom.pr,
  });
  return `Before merging, check the top layer against trunk, because GitHub's \`mergeable\` compares an upper layer only with its parent layer. ${why}. From a checkout of \`${result.repo}\`, run \`git fetch <remote> ${trunk}\` (\`<remote>\` is the remote that points at \`${result.repo}\`), then \`git merge-tree --write-tree FETCH_HEAD ${top.headRefOid}\`. This writes no files and no refs. If it exits 0, continue with the next step. If it exits 1, it lists the conflicts: do not merge, and do not merge layer by layer. Update the whole stack from its bottom layer onto \`${trunk}\`, then push it. ${rebase} Then rerun the stack command.`;
}

/** Appended to the `gh stack merge` step: that merge is atomic, so a conflict merges nothing. */
export const MERGE_CONFLICT_NOTE =
  "If `gh stack merge` reports `Merge conflict detected`, nothing was merged. Do not rerun the merge; update the stack from its bottom layer onto trunk with `gh stack rebase`, then `gh stack push`, following the Branch update playbook, and rerun the stack command.";
