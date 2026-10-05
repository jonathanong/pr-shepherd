import type { StackStatus } from "../../types.mts";
import { playbookPointer } from "../playbook-pointer.mts";

/**
 * Where a native-stack rebase starts: an upper layer rebases from its parent stack branch
 * without touching trunk; the bottom layer rebases the whole stack onto trunk.
 */
export type NativeStackRebaseStart =
  | { parentBranch: string }
  | { bottomPr: number }
  | { trunk: string };

/**
 * One gh-stack rebase step. A native stack layer must not be rebased or merged from its base
 * branch alone: that rewrites one branch and strands every layer above it.
 *
 * `gh stack` rebases the stack it tracks locally and `gh stack push` publishes those local
 * layers, so the step first imports the stack by its number (a bare number resolves as a
 * stack number before a PR number) and checks each local layer against its PR head.
 */
export function buildNativeStackRebaseInstruction(
  repo: string,
  stackNumber: number,
  start: NativeStackRebaseStart,
): string {
  const [checkout, command] =
    "parentBranch" in start
      ? [
          `check out the parent stack branch \`${start.parentBranch}\``,
          "gh stack rebase --upstack --no-trunk",
        ]
      : "bottomPr" in start
        ? [`check out the head branch of PR #${start.bottomPr}`, "gh stack rebase"]
        : [`check out the bottom open layer whose base is \`${start.trunk}\``, "gh stack rebase"];
  const prepare = `if \`gh stack\` does not track stack #${stackNumber} locally, import it with \`gh stack checkout ${stackNumber}\``;
  return `From a clean checkout of \`${repo}\`, ${prepare}. Then ${checkout} and run \`${command}\`. ${playbookPointer("Branch update")}`;
}

/**
 * The stack-aware branch update for a native stack layer (a conflict, or a behind branch whose
 * workflow keeps failing); undefined outside a stack.
 * A layer whose PR targets the stack's trunk (`stack.baseRefName`) is the bottom open layer —
 * position 1, or a higher layer GitHub retargeted after every layer below it merged. Any other
 * layer is an upper layer whose parent is its own PR base branch. `trunkConflict` means that
 * upper layer already contains its parent, so the rebase starts at the bottom open layer.
 */
export function buildNativeStackLayerRebase(
  repo: string,
  pr: { number: number; baseBranch: string },
  stack: StackStatus | undefined,
  trunkConflict?: { trunk: string; bottomPr?: number },
): string | undefined {
  if (!stack) return undefined;
  const start: NativeStackRebaseStart = trunkConflict
    ? trunkConflict.bottomPr !== undefined
      ? { bottomPr: trunkConflict.bottomPr }
      : { trunk: trunkConflict.trunk }
    : pr.baseBranch === stack.baseRefName
      ? { bottomPr: pr.number }
      : { parentBranch: pr.baseBranch };
  return buildNativeStackRebaseInstruction(repo, stack.number, start);
}

/** Point at the conflicts, and at the stack rebase when the PR is a native stack layer. */
export function buildConflictInstruction(stackRebase: string | undefined): string {
  const pointer = "The branch has merge conflicts (see `**branch**` above).";
  return stackRebase ? `${pointer} ${stackRebase}` : `${pointer} Resolve them before committing.`;
}

/**
 * Push a conflict resolution or branch refresh: one branch, or the whole rewritten native stack.
 * After a merge-queue ejection update, push only when the update or a fix changed the head.
 */
export function buildBranchPushInstruction(
  stackRebase: string | undefined,
  hasConflicts: boolean,
  mutationSuffix: string,
  ejectionUpdate = false,
): string {
  if (ejectionUpdate) {
    const push = stackRebase
      ? "commit any remaining changes on the PR head branch and push the rewritten stack with `gh stack push`"
      : "commit any remaining changes and push to the PR head branch";
    return `If the base update or a fix changed the head, ${push}${mutationSuffix}. If neither did, do not push.`;
  }
  if (stackRebase)
    return `Commit any remaining changes on the PR head branch and push the rewritten stack with \`gh stack push\`${mutationSuffix}.`;
  return hasConflicts
    ? `Commit any remaining conflict-resolution changes and push to the PR head branch${mutationSuffix}.`
    : "Push the updated PR head branch before iterating immediately.";
}
