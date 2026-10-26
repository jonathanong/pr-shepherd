export const sha = (number: number) => String(number).padStart(40, "0");

export function rawPr(number: number) {
  return {
    number,
    title: `PR ${number}`,
    url: `https://github.com/acme/widgets/pull/${number}`,
    state: "OPEN",
    isDraft: false,
    viewerCanUpdate: true,
    headRefName: `feature-${number}`,
    headRefOid: sha(number),
    baseRefName: "main",
    baseRefOid: sha(1),
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: null,
    isInMergeQueue: false,
    stack: null,
    stackEntry: null,
    comments: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    reviews: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    reviewThreads: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    commits: { nodes: [{ commit: { statusCheckRollup: null } }] },
  };
}

export function explicit(numbers: number[]) {
  return {
    data: {
      repository: {
        viewerCanAdminister: false,
        ...Object.fromEntries(numbers.map((pr, index) => [`pr${index}`, rawPr(pr)])),
      },
    },
  };
}
