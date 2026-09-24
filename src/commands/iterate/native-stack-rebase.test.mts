import { describe, expect, it } from "vitest";
import {
  buildBranchPushInstruction,
  buildConflictInstruction,
  buildNativeStackLayerRebase,
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
  const prepare =
    "From a clean checkout of `acme/widgets`, if `gh stack` does not track stack #7 locally, import it with `gh stack checkout 7`, then confirm every layer's local branch is at its PR's head commit — a stale local layer would overwrite that PR's newer commits on push.";

  it("rebases an upper layer from its parent without trunk", () => {
    expect(
      buildNativeStackRebaseInstruction("acme/widgets", 7, { parentBranch: "feature-a" }),
    ).toBe(
      `${prepare} Then check out the parent stack branch \`feature-a\` and run \`gh stack rebase --upstack --no-trunk\`; if it stops on a conflict, resolve it and run \`gh stack rebase --continue\`.`,
    );
  });

  it("rebases the whole stack onto trunk from the bottom layer", () => {
    expect(buildNativeStackRebaseInstruction("acme/widgets", 7, { bottomPr: 9 })).toBe(
      `${prepare} Then check out the head branch of PR #9 and run \`gh stack rebase\`; if it stops on a conflict, resolve it and run \`gh stack rebase --continue\`.`,
    );
  });

  it("imports the layer's stack by stack number, not PR number", () => {
    const upperRebase = buildNativeStackLayerRebase("acme/widgets", upperPr, upperLayer);
    expect(upperRebase).toContain("`gh stack checkout 7`");
    expect(upperRebase).not.toContain("gh stack checkout 42");
  });

  it("chooses the rebase start from the layer's PR base and skips non-stack PRs", () => {
    const upperRebase = buildNativeStackLayerRebase("acme/widgets", upperPr, upperLayer);
    expect(upperRebase).toContain("check out the parent stack branch `feature-parent`");
    expect(upperRebase).not.toContain("`main`");
    expect(buildNativeStackLayerRebase("acme/widgets", upperPr, undefined)).toBeUndefined();
  });

  it.each([
    ["the first layer", 1],
    ["a layer retargeted onto trunk after the layers below it merged", 3],
  ])("rebases %s onto trunk", (_case, position) => {
    const rebase = buildNativeStackLayerRebase(
      "acme/widgets",
      { number: 42, baseBranch: "main" },
      { ...upperLayer, position },
    );
    expect(rebase).toContain("check out the head branch of PR #42 and run `gh stack rebase`;");
    expect(rebase).not.toContain("--no-trunk");
  });

  it("keeps the single-branch conflict wording outside a stack", () => {
    expect(buildConflictInstruction(undefined)).toBe(
      "The branch has merge conflicts (see `**branch**` above). Resolve them before committing.",
    );
    expect(buildBranchPushInstruction(undefined, true, "")).toBe(
      "Commit any remaining conflict-resolution changes and push to the PR head branch.",
    );
    expect(buildBranchPushInstruction(undefined, false, "")).toBe(
      "Push the updated PR head branch before iterating immediately.",
    );
    expect(buildBranchPushInstruction("rebase", false, " before review mutations")).toBe(
      "Commit any remaining changes on the PR head branch and push the rewritten stack with `gh stack push` before review mutations.",
    );
  });

  it("routes repeated-workflow conflict recovery and completion through the stack", () => {
    const rebase = buildNativeStackLayerRebase("acme/widgets", upperPr, upperLayer);
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

  it("routes repeated-workflow behind recovery and SHA-gated completion through the stack", () => {
    const rebase = buildNativeStackLayerRebase(
      "acme/widgets",
      { number: 42, baseBranch: "main" },
      { ...upperLayer, position: 1 },
    );
    expect(
      buildRepeatedWorkflowBranchRecoveryInstructions(
        "main",
        true,
        { isBehind: true, hasConflicts: false },
        rebase,
      ),
    ).toEqual([
      "The workflow rerun still fails while the branch is behind PR base branch `main`. Inspect the current base branch for an existing fix before choosing a remediation.",
      rebase,
    ]);
    expect(buildFixCompletionInstruction([], false, true, true)).toBe(
      "`[FIX_CODE]` is non-terminal: if you changed code, commit and push the rewritten stack with `gh stack push`, then run the review mutations using the pushed commit SHA and iterate immediately with the same options; if you did not change code, complete the authorized review mutations and iterate immediately with the same options.",
    );
  });
});
