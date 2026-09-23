import { describe, expect, it } from "vitest";
import {
  buildConflictInstruction,
  buildConflictPushInstruction,
  buildNativeStackConflictRebase,
  buildNativeStackRebaseInstruction,
} from "./native-stack-rebase.mts";
import {
  buildFixCompletionInstruction,
  buildRepeatedWorkflowBranchRecoveryInstructions,
} from "./check-instructions.mts";

// A native stack reports its trunk as `baseRefName`; an upper layer's parent is its PR base.
const upperLayer = { number: 7, size: 3, position: 2, baseRefName: "main" };
const upperPr = { number: 42, baseBranch: "feature-parent" };

describe("native stack rebase instructions", () => {
  it("rebases an upper layer from its parent without trunk", () => {
    expect(buildNativeStackRebaseInstruction("acme/widgets", { parentBranch: "feature-a" })).toBe(
      "From a clean checkout of `acme/widgets`, check out the parent stack branch `feature-a` and run `gh stack rebase --upstack --no-trunk`; if it stops on a conflict, resolve it and run `gh stack rebase --continue`.",
    );
  });

  it("rebases the whole stack onto trunk from the bottom layer", () => {
    expect(buildNativeStackRebaseInstruction("acme/widgets", { bottomPr: 9 })).toBe(
      "From a clean checkout of `acme/widgets`, check out the head branch of PR #9 and run `gh stack rebase`; if it stops on a conflict, resolve it and run `gh stack rebase --continue`.",
    );
  });

  it("chooses the rebase start from the layer position and skips non-stack PRs", () => {
    const upperRebase = buildNativeStackConflictRebase("acme/widgets", upperPr, upperLayer);
    expect(upperRebase).toContain("check out the parent stack branch `feature-parent`");
    expect(upperRebase).not.toContain("`main`");
    expect(
      buildNativeStackConflictRebase("acme/widgets", upperPr, { ...upperLayer, position: 1 }),
    ).toContain("check out the head branch of PR #42");
    expect(buildNativeStackConflictRebase("acme/widgets", upperPr, undefined)).toBeUndefined();
  });

  it("keeps the single-branch conflict wording outside a stack", () => {
    expect(buildConflictInstruction(undefined)).toBe(
      "The branch has merge conflicts (see `**branch**` above). Resolve them before committing.",
    );
    expect(buildConflictPushInstruction(undefined, "")).toBe(
      "Commit any remaining conflict-resolution changes and push to the PR head branch.",
    );
    expect(buildConflictPushInstruction("rebase", " before review mutations")).toBe(
      "Commit any remaining changes on the PR head branch and push the rewritten stack with `gh stack push` before review mutations.",
    );
  });

  it("routes repeated-workflow conflict recovery and completion through the stack", () => {
    const rebase = buildNativeStackConflictRebase("acme/widgets", upperPr, upperLayer);
    expect(
      buildRepeatedWorkflowBranchRecoveryInstructions(
        "feature-parent",
        true,
        { isBehind: false, hasConflicts: true },
        rebase,
      )[1],
    ).toBe(rebase);
    expect(buildFixCompletionInstruction([], true, false, true)).toBe(
      "`[FIX_CODE]` is non-terminal: resolve the conflicts, commit, push the rewritten stack with `gh stack push`, then iterate immediately with the same options.",
    );
  });
});
