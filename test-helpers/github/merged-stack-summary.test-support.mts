import type { RawSummaryPr } from "../../src/github/poll-summary-raw.mts";

function blockedLayer(nodes: Array<Record<string, unknown>>, checkSuites?: unknown): RawSummaryPr {
  return {
    number: 622,
    title: "Copyright sweep",
    url: "https://github.com/acme/widgets/pull/622",
    state: "OPEN",
    isDraft: false,
    viewerCanUpdate: true,
    headRefName: "feature",
    headRefOid: "a".repeat(40),
    baseRefName: "feature-parent",
    baseRefOid: "b".repeat(40),
    mergeable: "MERGEABLE",
    mergeStateStatus: "BLOCKED",
    reviewDecision: null,
    isInMergeQueue: false,
    mergeQueueEntry: null,
    stack: { number: 623, size: 2, baseRefName: "main" },
    stackEntry: { position: 2 },
    comments: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    reviews: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    reviewThreads: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    commits: {
      nodes: [
        {
          commit: {
            oid: "c".repeat(40),
            statusCheckRollup: {
              contexts: {
                totalCount: nodes.length,
                pageInfo: { hasPreviousPage: false },
                nodes,
              },
            },
            ...(checkSuites !== undefined && { checkSuites }),
          },
        },
      ],
    },
  } as unknown as RawSummaryPr;
}

const passed = (name: string) => ({
  __typename: "CheckRun" as const,
  name,
  status: "COMPLETED",
  conclusion: "SUCCESS",
  checkSuite: { workflowRun: { event: "pull_request" } },
});

const trunk = ["tests", "build", "gitleaks"];

export const trunkRef = {
  branchProtectionRule: null,
  rules: {
    nodes: [
      {
        type: "REQUIRED_STATUS_CHECKS",
        parameters: { requiredStatusChecks: trunk.map((context) => ({ context })) },
      },
    ],
  },
};

export function partialStack() {
  return [2509, 2534, 2547, 2569, 2627, 2629].map((number, index, numbers) => ({
    position: index + 1,
    pullRequest: {
      ...blockedLayer([passed("gitleaks")]),
      number,
      state: index < 2 ? "MERGED" : "OPEN",
      headRefName: `feature-${number}`,
      headRefOid: String(number).padStart(40, "0"),
      baseRefName: index < 2 ? "main" : `feature-${numbers[index - 1]}`,
      baseRefOid: index < 2 ? "b".repeat(40) : String(numbers[index - 1]).padStart(40, "0"),
      baseRef: index < 2 ? trunkRef : null,
      stack: { number: 2535, size: numbers.length, baseRefName: "main" },
      stackEntry: { position: index + 1 },
    },
  }));
}

export function summaryPage(nodes: ReturnType<typeof partialStack>) {
  return {
    data: {
      repository: {
        viewerCanAdminister: false,
        pullRequest: {
          stack: {
            id: "STACK_2535",
            number: 2535,
            size: nodes.length,
            baseRefName: "main",
            entries: { pageInfo: { hasNextPage: false, endCursor: null }, nodes },
          },
        },
      },
    },
  };
}
