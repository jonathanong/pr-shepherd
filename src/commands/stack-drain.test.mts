import { describe, expect, it } from "vitest";
import { row, stack } from "../../test-helpers/commands/poll-summary-stack.test-support.mts";
import { withPollSummaryInstructions } from "./poll-summary-instructions.mts";
import { planPrefixDrain } from "./stack-drain.mts";

const ready = { readyReceipt: true } as const;

function text(result: { instructions?: string[] }): string {
  return result.instructions?.join("\n") ?? "";
}

describe("bottom-layer stack drain", () => {
  it("sends an ejected layer to its one-PR session", () => {
    const result = withPollSummaryInstructions(
      stack([
        row(1, 1, {
          action: "fix_code",
          reasons: ["queue-removal"],
          queueRemoval: {
            reason: "CI_FAILURE",
            actor: "github",
            createdAtUnix: 1,
            beforeCommitOid: "a".repeat(40),
          },
        }),
      ]),
      false,
    );
    expect(text(result)).toContain(
      "PR #1 was removed from the merge queue (`CI_FAILURE` by @github). Run `pr-shepherd https://github.com/acme/widgets/pull/1 --until-terminal` for PR #1. That session fixes failing queue CI, or escalates when the removal has no concrete fix.",
    );
  });

  it("merges the top PR when every layer is ready", () => {
    const result = withPollSummaryInstructions(
      stack([row(1, 1, ready), row(2, 2, ready), row(3, 3, ready)]),
      true,
    );
    expect(result).toMatchObject({ nextAction: "merge", stackMergeable: true });
    expect(result.instructions?.[0]).toContain(
      "`GH_REPO=acme/widgets gh stack merge 3 --yes --squash`",
    );
    expect(result.instructions?.[0]).toContain("PR #3 and every unmerged layer below it");
    expect(text(result)).not.toContain("gh stack merge --yes --squash 9");
    expect(text(result)).not.toContain("--help");
    expect(text(result)).toContain("GitHub retargets the next layer onto `main`");
  });

  it("merges a ready bottom while shepherding unready upper layers", () => {
    const result = withPollSummaryInstructions(
      stack([
        row(1, 1, ready),
        row(2, 2),
        row(3, 3, { isDraft: true, action: "fix_code", reasons: ["review-work"] }),
      ]),
      true,
    );
    expect(result).toMatchObject({ nextAction: "merge", stackMergeable: false });
    expect(result.instructions?.[0]).toContain("gh stack merge 1 --yes --squash");
    expect(text(result)).toContain("pull/2 --until-terminal` for PR #2");
    expect(text(result)).toContain("pull/3 --until-terminal` for PR #3");
    expect(text(result)).not.toContain("stack-blocked");
  });

  it("merges a ready bottom beneath an escalated upper layer", () => {
    const result = withPollSummaryInstructions(
      stack([row(1, 1, ready), row(2, 2, { action: "escalate", reasons: ["fix-thrash"] })]),
      true,
    );
    expect(result.nextAction).toBe("merge");
    expect(result.instructions?.[0]).toContain("gh stack merge 1 --yes --squash");
    expect(text(result)).not.toContain("pull/2 --until-terminal");
    expect(text(result)).toContain(
      "PR #2 requires human action (fix-thrash). Keep shepherding other PRs before the handoff.",
    );
  });

  it("merges the retargeted bottom once the layers below it merged", () => {
    const result = withPollSummaryInstructions(
      stack([
        row(1, 1, { state: "MERGED", reasons: ["merged"] }),
        row(2, 2, { ...ready, baseRefName: "main" }),
        row(3, 3),
      ]),
      true,
    );
    expect(result.nextAction).toBe("merge");
    expect(result.instructions?.[0]).toContain(
      "PR #2 is the highest open layer of stack #9 in `acme/widgets`",
    );
    expect(result.instructions?.[0]).toContain("gh stack merge 2 --yes --squash");
  });

  it("waits for GitHub to retarget a ready bottom after its parent merges", () => {
    const result = withPollSummaryInstructions(
      stack([
        row(1, 1, { state: "MERGED", reasons: ["merged"] }),
        row(2, 2, ready),
        row(3, 3, ready),
      ]),
      true,
    );
    expect(result).toMatchObject({ nextAction: "wait", reason: "waiting" });
    expect(text(result)).toContain("PR #2 still targets `layer-1` rather than `main`");
    expect(text(result)).not.toContain("gh stack merge");
  });

  it("merges a ready bottom beneath a layer that closed without merging", () => {
    const result = withPollSummaryInstructions(
      stack([
        row(1, 1, ready),
        row(2, 2, { state: "CLOSED", reasons: ["closed"] }),
        row(3, 3, ready),
      ]),
      true,
    );
    expect(result.nextAction).toBe("merge");
    expect(result.prs[1]?.reasons).toContain("closed-unmerged-dependency");
    expect(result.instructions?.[0]).toContain("gh stack merge 1 --yes --squash");
    expect(text(result)).toContain(
      "PR #2 was closed without merging below an open layer. After autonomous shepherding, ask the stack owner",
    );
    expect(text(result)).not.toContain("PR #2 requires human action");
  });

  it("does not merge above a layer that closed without merging", () => {
    const result = withPollSummaryInstructions(
      stack([
        row(1, 1, { state: "CLOSED", reasons: ["closed"] }),
        row(2, 2, { ...ready, baseRefName: "main" }),
        row(3, 3, ready),
      ]),
      true,
    );
    expect(result.nextAction).toBe("escalate");
    expect(text(result)).not.toContain("gh stack merge");
  });

  it("does not merge a bottom whose ancestry is stale", () => {
    const result = withPollSummaryInstructions(
      stack(
        [
          row(1, 1, { state: "MERGED", reasons: ["merged"] }),
          row(2, 2, { state: "MERGED", reasons: ["merged"] }),
          row(3, 3, { ...ready, baseRefName: "main" }),
        ],
        true,
      ),
      true,
    );
    expect(result.nextAction).toBe("shepherd");
    expect(text(result)).toContain("pull/3 --until-terminal");
    expect(text(result)).not.toContain("gh stack merge");
  });

  it("does not merge again while a layer is in the merge queue", () => {
    const result = withPollSummaryInstructions(
      stack([row(1, 1, { ...ready, isInMergeQueue: true }), row(2, 2), row(3, 3)]),
      true,
    );
    expect(result.nextAction).toBe("shepherd");
    expect(result.prs[0]?.reasons).toContain("already-in-merge-queue");
    expect(text(result)).not.toContain("gh stack merge");
  });

  it("never prints a merge command without merge intent", () => {
    const result = withPollSummaryInstructions(
      stack([row(1, 1, ready), row(2, 2), row(3, 3)]),
      false,
    );
    expect(result.nextAction).toBe("shepherd");
    expect(text(result)).not.toContain("gh stack merge");
  });
});

describe("planPrefixDrain", () => {
  it("selects the highest ready open layer regardless of row order", () => {
    const plan = planPrefixDrain(
      stack([
        row(3, 3),
        row(2, 2, { ...ready, baseRefName: "main" }),
        row(1, 1, { state: "MERGED" }),
      ]),
      true,
    );
    expect(plan?.instructions[0]).toContain("gh stack merge 2 --yes --squash");
    expect(plan?.instructions[0]).toContain("that layer alone");
  });

  it.each([
    ["an unready bottom", [row(1, 1), row(2, 2, ready)]],
    ["an escalated bottom", [row(1, 1, { ...ready, action: "escalate" }), row(2, 2)]],
    ["a bottom without stack metadata", [row(1, 1, { ...ready, stack: undefined })]],
    ["a queued upper layer", [row(1, 1, ready), row(2, 2, { ...ready, isInMergeQueue: true })]],
    ["no open layer", [row(1, 1, { state: "MERGED" })]],
  ] as const)("returns nothing for %s", (_case, prs) => {
    expect(planPrefixDrain(stack([...prs]), true)).toBeUndefined();
  });
});
