export const REPO = { owner: "owner", name: "repo" };

export function makeRawPr(overrides: Record<string, unknown> = {}) {
  return {
    id: "PR_kgDOAAA",
    number: 42,
    state: "OPEN",
    isDraft: false,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: "APPROVED",
    headRefOid: "abc123",
    headRefName: "feature",
    headRepository: { nameWithOwner: "owner/repo" },
    baseRefName: "main",
    reviewRequests: { nodes: [] },
    latestReviews: { nodes: [] },
    reviewThreads: { pageInfo: { hasPreviousPage: false, startCursor: null }, nodes: [] },
    comments: { pageInfo: { hasPreviousPage: false, startCursor: null }, nodes: [] },
    changesRequestedReviews: {
      pageInfo: { hasPreviousPage: false, startCursor: null },
      nodes: [],
    },
    reviewSummaries: { pageInfo: { hasPreviousPage: false, startCursor: null }, nodes: [] },
    approvedReviews: { pageInfo: { hasPreviousPage: false, startCursor: null }, nodes: [] },
    allReviews: { totalCount: 0 },
    commits: {
      totalCount: 1,
      nodes: [{ commit: { committedDate: "2024-01-01T00:00:00Z", statusCheckRollup: null } }],
    },
    ...overrides,
  };
}

export function makeResponse(pr: ReturnType<typeof makeRawPr> | null = makeRawPr()) {
  return { data: { repository: { pullRequest: pr } } };
}

export function makeContextPr(node: Record<string, unknown>) {
  return makeRawPr({
    commits: {
      totalCount: 1,
      nodes: [
        {
          commit: {
            committedDate: "2024-01-01T00:00:00Z",
            statusCheckRollup: {
              contexts: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [node] },
            },
          },
        },
      ],
    },
  });
}
