import type { PollSummaryItem, PollSummaryResult } from "../../src/types.mts";

/** One layer of synthetic native stack #9 in acme/widgets, clean but without a READY receipt. */
export function row(
  pr: number,
  position: number,
  overrides: Partial<PollSummaryItem> = {},
): PollSummaryItem {
  return {
    pr,
    repo: "acme/widgets",
    title: `Layer ${pr}`,
    url: `https://github.com/acme/widgets/pull/${pr}`,
    action: "cancel",
    reasons: ["appears-ready"],
    state: "OPEN",
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    headRefName: `layer-${pr}`,
    headRefOid: String(pr).padStart(40, "0"),
    baseRefName: position === 1 ? "main" : `layer-${pr - 1}`,
    stack: { number: 9, size: 3, position, baseRefName: "main" },
    pollCommand: `pr-shepherd https://github.com/acme/widgets/pull/${pr} --until-terminal`,
    ...overrides,
  };
}

/** A stack-selector summary over `prs`; `gap` adds stale ancestry between PR #2 and PR #3. */
export function stack(prs: PollSummaryItem[], gap = false): PollSummaryResult {
  return {
    mode: "summary",
    repo: "acme/widgets",
    selection: { kind: "stack", anchor: 3, stackNumber: 9, stackSize: 3 },
    reason: "actionable",
    prs,
    ...(gap && {
      stackAncestry: [
        {
          parentPr: 2,
          parentHeadRefName: "layer-2",
          parentHeadRefOid: "b".repeat(40),
          childPr: 3,
          childBaseRefName: "layer-2",
          childBaseRefOid: "a".repeat(40),
        },
      ],
    }),
  };
}
