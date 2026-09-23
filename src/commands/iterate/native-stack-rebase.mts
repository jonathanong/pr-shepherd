import type { StackStatus } from "../../types.mts";

/**
 * Where a native-stack rebase starts: an upper layer rebases from its parent stack branch
 * without touching trunk; the bottom layer rebases the whole stack onto trunk.
 */
export type NativeStackRebaseStart = { parentBranch: string } | { bottomPr: number };

/**
 * One gh-stack rebase step. A native stack layer must not be rebased or merged from its base
 * branch alone: that rewrites one branch and strands every layer above it.
 */
export function buildNativeStackRebaseInstruction(
  repo: string,
  start: NativeStackRebaseStart,
): string {
  const [checkout, command] =
    "parentBranch" in start
      ? [
          `check out the parent stack branch \`${start.parentBranch}\``,
          "gh stack rebase --upstack --no-trunk",
        ]
      : [`check out the head branch of PR #${start.bottomPr}`, "gh stack rebase"];
  return `From a clean checkout of \`${repo}\`, ${checkout} and run \`${command}\`; if it stops on a conflict, resolve it and run \`gh stack rebase --continue\`.`;
}

/**
 * The stack-aware conflict repair for a native stack layer; undefined outside a stack.
 * An upper layer's parent is its own PR base branch — `stack.baseRefName` is the stack's trunk.
 */
export function buildNativeStackConflictRebase(
  repo: string,
  pr: { number: number; baseBranch: string },
  stack: StackStatus | undefined,
): string | undefined {
  if (!stack) return undefined;
  return buildNativeStackRebaseInstruction(
    repo,
    stack.position > 1 ? { parentBranch: pr.baseBranch } : { bottomPr: pr.number },
  );
}

/** Point at the conflicts, and at the stack rebase when the PR is a native stack layer. */
export function buildConflictInstruction(stackRebase: string | undefined): string {
  const pointer = "The branch has merge conflicts (see `**branch**` above).";
  return stackRebase ? `${pointer} ${stackRebase}` : `${pointer} Resolve them before committing.`;
}

/** Push the conflict resolution: one branch, or the whole rewritten native stack. */
export function buildConflictPushInstruction(
  stackRebase: string | undefined,
  mutationSuffix: string,
): string {
  return stackRebase
    ? `Commit any remaining changes on the PR head branch and push the rewritten stack with \`gh stack push\`${mutationSuffix}.`
    : `Commit any remaining conflict-resolution changes and push to the PR head branch${mutationSuffix}.`;
}
