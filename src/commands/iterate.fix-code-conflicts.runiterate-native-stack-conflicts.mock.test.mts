import { describe, it, expect, vi } from "vitest";

const { mockFetchPollSummary } = vi.hoisted(() => ({ mockFetchPollSummary: vi.fn() }));
vi.mock("../github/poll-summary.mts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../github/poll-summary.mts")>()),
  fetchPollSummary: mockFetchPollSummary,
}));

import {
  registerIterateHooks,
  makeOpts,
  makeReport,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";
import type { StackStatus } from "../types.mts";

registerIterateHooks();

const openRequirements = {
  approvals: { current: 0, requiredCount: 0 },
  conversationsResolved: { resolved: true, unresolvedCount: 0, required: false },
};

// A native stack reports its trunk as `baseRefName`; an upper layer's parent is its PR base.
const trunkStack = { number: 7, size: 3, baseRefName: "main" };

async function runStackConflict(stack: StackStatus, baseBranch = "main"): Promise<string[]> {
  mockRunCheck.mockResolvedValue(
    makeReport({
      baseBranch,
      status: "FAILING",
      mergeStatus: {
        status: "CONFLICTS",
        state: "OPEN",
        isDraft: false,
        mergeable: "CONFLICTING",
        reviewDecision: null,
        blockingBotReviewInProgress: false,
        mergeStateStatus: "DIRTY",
        mergeRequirements: { ...openRequirements, stack },
      },
    }),
  );
  mockUpdateReadyDelay.mockResolvedValue({
    isReady: false,
    shouldCancel: false,
    remainingSeconds: 600,
  });
  const result = await runIterate(makeOpts());
  expect(result.action).toBe("fix_code");
  return result.action === "fix_code" ? result.fix.instructions : [];
}

describe("runIterate — fix_code (native stack merge conflicts)", () => {
  it("rebases an upper layer from its parent stack branch and pushes the whole stack", async () => {
    mockFetchPollSummary.mockResolvedValue({ prs: [] });

    const instructions = await runStackConflict({ ...trunkStack, position: 2 }, "feature-parent");

    expect(instructions).toContain(
      "The branch has merge conflicts (see `**branch**` above). From a clean checkout of `owner/repo`, if `gh stack` does not track stack #7 locally, import it with `gh stack checkout 7`, then confirm every layer's local branch is at its PR's head commit — a stale local layer would overwrite that PR's newer commits on push. Then check out the parent stack branch `feature-parent` and run `gh stack rebase --upstack --no-trunk`; if it stops on a conflict, resolve it and run `gh stack rebase --continue`.",
    );
    expect(instructions).toContain(
      "Commit any remaining changes on the PR head branch and push the rewritten stack with `gh stack push`.",
    );
    expect(instructions.at(-1)).toBe(
      "`[FIX_CODE]` is non-terminal: resolve the conflicts, commit, push the rewritten stack with `gh stack push`, then iterate immediately with the same options.",
    );
    const joined = instructions.join("\n");
    expect(joined).not.toContain("check out the parent stack branch `main`");
    expect(joined).not.toContain("Resolve them before committing.");
    expect(joined).not.toContain("push to the PR head branch");
  });

  it("rebases the whole stack onto trunk when the bottom layer conflicts", async () => {
    const instructions = await runStackConflict({ ...trunkStack, position: 1 });

    expect(instructions).toContain(
      "The branch has merge conflicts (see `**branch**` above). From a clean checkout of `owner/repo`, if `gh stack` does not track stack #7 locally, import it with `gh stack checkout 7`, then confirm every layer's local branch is at its PR's head commit — a stale local layer would overwrite that PR's newer commits on push. Then check out the head branch of PR #42 and run `gh stack rebase`; if it stops on a conflict, resolve it and run `gh stack rebase --continue`.",
    );
    expect(instructions.join("\n")).not.toContain("--no-trunk");
    expect(mockFetchPollSummary).not.toHaveBeenCalled();
  });

  it("rebases onto trunk from a higher layer once every layer below it merged", async () => {
    const joined = (await runStackConflict({ ...trunkStack, position: 3 })).join("\n");

    expect(joined).toContain("check out the head branch of PR #42 and run `gh stack rebase`;");
    expect(joined).not.toContain("--no-trunk");
    expect(joined).not.toContain("check out the parent stack branch `main`");
  });

  it("routes a conflicting layer with a stale boundary through one stack rebase", async () => {
    mockFetchPollSummary.mockResolvedValue({
      prs: [],
      stackAncestry: [
        {
          parentPr: 41,
          parentHeadRefName: "feature-parent",
          parentHeadRefOid: "parent-current",
          childPr: 42,
          childBaseRefName: "feature-parent",
          childBaseRefOid: "parent-old",
        },
      ],
    });

    const instructions = await runStackConflict({ ...trunkStack, position: 2 }, "feature-parent");

    const joined = instructions.join("\n");
    expect(joined.match(/gh stack rebase --upstack --no-trunk/g)).toHaveLength(1);
    expect(joined).not.toContain("records base `feature-parent` at `parent-old`");
    expect(instructions.at(-1)).toContain("push the rewritten stack with `gh stack push`");
  });
});
