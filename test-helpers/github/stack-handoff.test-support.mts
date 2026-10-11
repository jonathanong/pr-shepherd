/* eslint-disable max-lines */
/**
 * One model of a two-layer native stack, rendered three ways: as GitHub would
 * answer `PollStackSummary` (the summary fragment), `StackHandoffCheckRuns`, and
 * `BatchPr`. A routed layer's handoff must rebuild exactly the `BatchPr` page.
 */
const TRUNK_TIP = "c".repeat(40);
export const HEADS = { 101: "a".repeat(40), 102: "b".repeat(40) } as const;
const ref = { branchProtectionRule: null, rules: { pageInfo: { hasNextPage: false }, nodes: [] } };
const author = { __typename: "User", login: "reviewer" };
const me = { __typename: "User", login: "me" };

interface Review {
  id: string;
  state: string;
  body: string;
  isMinimized: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LayerModel {
  number: 101 | 102;
  headRefName: string;
  baseRefName: string;
  baseRefOid: string;
  reviewDecision: string | null;
  reviews: Review[];
  threads: Array<{ id: string; isResolved: boolean; comments: string[] }>;
  comments: Array<{ id: string; body: string; isMinimized: boolean }>;
  /** Check runs; each has one annotation when `annotated`. */
  runs: Array<{ id: string; name: string; conclusion: string | null; annotated?: boolean }>;
  status?: { context: string; state: string };
  teamReviewer?: boolean;
}

export function stackModel(): LayerModel[] {
  return [
    {
      number: 101,
      headRefName: "user-model",
      baseRefName: "main",
      baseRefOid: TRUNK_TIP,
      reviewDecision: "CHANGES_REQUESTED",
      reviews: [
        review("PRR_1", "CHANGES_REQUESTED", "Please rename the model."),
        review("PRR_2", "COMMENTED", "A few notes."),
        review("PRR_3", "APPROVED", ""),
      ],
      threads: [{ id: "PRRT_1", isResolved: false, comments: ["Rename this."] }],
      comments: [{ id: "IC_1", body: "Looks close.", isMinimized: false }],
      runs: [
        { id: "CR_1", name: "lint", conclusion: "FAILURE", annotated: true },
        { id: "CR_2", name: "test", conclusion: "SUCCESS" },
      ],
      status: { context: "deploy/preview", state: "SUCCESS" },
      teamReviewer: true,
    },
    {
      number: 102,
      headRefName: "user-ui",
      baseRefName: "user-model",
      baseRefOid: HEADS[101],
      reviewDecision: null,
      reviews: [],
      threads: [],
      comments: [],
      runs: [{ id: "CR_3", name: "test", conclusion: "FAILURE", annotated: true }],
    },
  ];
}

function review(id: string, state: string, body: string): Review {
  return {
    id,
    state,
    body,
    isMinimized: false,
    createdAt: "2026-10-09T00:00:00Z",
    updatedAt: "2026-10-09T00:00:01Z",
  };
}

const at = "2026-10-09T00:00:00Z";
const url = (layer: LayerModel, id: string) =>
  `https://github.com/octocat/hello-world/pull/${layer.number}#${id}`;

function annotation(run: { id: string; annotated?: boolean }) {
  return run.annotated
    ? {
        totalCount: 1,
        nodes: [
          {
            fullDatabaseId: "9001",
            path: "src/model.mts",
            annotationLevel: "FAILURE",
            title: "Lint",
            message: `Fix ${run.id}.`,
            rawDetails: null,
            blobUrl: "https://github.com/octocat/hello-world/blob/x/src/model.mts",
            location: { start: { line: 3, column: null }, end: { line: 3, column: null } },
          },
        ],
      }
    : { totalCount: 0, nodes: [] };
}

function suite(layer: LayerModel) {
  return {
    pageInfo: { hasNextPage: false },
    nodes: [
      {
        id: `CS_${layer.number}`,
        status: "COMPLETED",
        conclusion: layer.runs.some((run) => run.conclusion === "FAILURE") ? "FAILURE" : "SUCCESS",
        workflowRun: {
          databaseId: 7000 + layer.number,
          event: "pull_request",
          url: `https://github.com/octocat/hello-world/actions/runs/${7000 + layer.number}`,
          workflow: { name: "CI" },
        },
      },
    ],
  };
}

function runSuite(layer: LayerModel, summary: boolean) {
  return {
    createdAt: at,
    updatedAt: at,
    workflowRun: {
      ...(summary && { databaseId: 7000 + layer.number }),
      event: "pull_request",
      createdAt: at,
      updatedAt: at,
      workflow: { name: "CI", databaseId: 77 },
    },
  };
}

function contexts(layer: LayerModel, summary: boolean) {
  const runs = layer.runs.map((run) => ({
    __typename: "CheckRun",
    id: run.id,
    name: run.name,
    status: "COMPLETED",
    conclusion: run.conclusion,
    detailsUrl: `https://github.com/octocat/hello-world/runs/${run.id}`,
    ...(summary
      ? { startedAt: at, completedAt: at }
      : {
          completedAt: at,
          startedAt: at,
          title: `${run.name} title`,
          summary: `${run.name} summary`,
          annotations: annotation(run),
        }),
    checkSuite: runSuite(layer, summary),
  }));
  const status = layer.status
    ? [
        {
          __typename: "StatusContext",
          ...layer.status,
          createdAt: at,
          targetUrl: "https://deploy.example/preview",
          description: "Preview ready",
        },
      ]
    : [];
  return [...runs, ...status];
}

function stackFields(model: LayerModel[]) {
  return model.map((layer, index) => ({
    position: index + 1,
    pullRequest: {
      number: layer.number,
      state: "OPEN",
      headRefName: layer.headRefName,
      headRefOid: HEADS[layer.number],
      baseRefName: layer.baseRefName,
      baseRefOid: layer.baseRefOid,
    },
  }));
}

function baseRef(layer: LayerModel) {
  return { ...ref, target: { oid: layer.baseRefName === "main" ? TRUNK_TIP : HEADS[101] } };
}

/** The `PollSummaryPr` fragment's answer for one layer. */
export function summaryLayer(layer: LayerModel, model: LayerModel[]) {
  return {
    id: `PR_${layer.number}`,
    number: layer.number,
    title: `Layer ${layer.number}`,
    url: `https://github.com/octocat/hello-world/pull/${layer.number}`,
    author: me,
    state: "OPEN",
    updatedAt: at,
    isDraft: false,
    viewerCanUpdate: true,
    viewerDidAuthor: true,
    viewerCanEnableAutoMerge: true,
    viewerCanEditFiles: true,
    headRepository: { nameWithOwner: "octocat/hello-world", viewerPermission: "ADMIN" },
    isMergeQueueEnabled: false,
    batchAutoMergeRequest: null,
    headRefName: layer.headRefName,
    headRefOid: HEADS[layer.number],
    baseRefName: layer.baseRefName,
    baseRefOid: layer.baseRefOid,
    baseRef: baseRef(layer),
    mergeable: "MERGEABLE",
    mergeStateStatus: "BLOCKED",
    lifecycleEvents: { nodes: [] },
    reviewDecision: layer.reviewDecision,
    reviewRequests: {
      nodes: layer.teamReviewer
        ? [
            { requestedReviewer: { __typename: "Team", name: "core" } },
            { requestedReviewer: { __typename: "User", login: "lead" } },
            { requestedReviewer: { __typename: "Mannequin", login: "ghost" } },
            { requestedReviewer: null },
          ]
        : [],
    },
    latestReviews: {
      nodes: layer.reviews.map((item) => ({ state: item.state, author })),
    },
    isInMergeQueue: false,
    mergeQueueAdditions: { nodes: [] },
    mergeQueueRemovals: { nodes: [] },
    headRefForcePushes: { nodes: [] },
    mergeQueueEntry: null,
    stack: { number: 7, size: model.length, baseRefName: "main" },
    stackEntry: { position: model.indexOf(layer) + 1 },
    comments: {
      totalCount: layer.comments.length,
      pageInfo: { hasPreviousPage: false },
      nodes: layer.comments.map((item) => ({
        id: item.id,
        body: item.body,
        isMinimized: item.isMinimized,
        viewerCanMinimize: true,
        url: url(layer, item.id),
        authorAssociation: "MEMBER",
        author,
        createdAt: at,
        updatedAt: at,
      })),
    },
    reviews: {
      totalCount: layer.reviews.length,
      pageInfo: { hasPreviousPage: false },
      nodes: layer.reviews.map((item) => ({
        id: item.id,
        body: item.body,
        state: item.state,
        isMinimized: item.isMinimized,
        viewerCanMinimize: true,
        authorAssociation: "MEMBER",
        author,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        url: url(layer, item.id),
        commit: { oid: HEADS[layer.number] },
      })),
    },
    reviewThreads: {
      totalCount: layer.threads.length,
      pageInfo: { hasPreviousPage: false },
      nodes: layer.threads.map((thread) => ({
        id: thread.id,
        isResolved: thread.isResolved,
        isOutdated: false,
        viewerCanReply: true,
        viewerCanResolve: true,
        path: "src/model.mts",
        line: 3,
        startLine: null,
        comments: {
          totalCount: thread.comments.length,
          pageInfo: { hasPreviousPage: false },
          nodes: thread.comments.map((body, index) => ({
            id: `${thread.id}_C${index}`,
            isMinimized: false,
            body,
            url: `${url(layer, thread.id)}discussion_r${1000 + index}`,
            authorAssociation: "MEMBER",
            viewerDidAuthor: false,
            author,
            pullRequestReview: { id: "PRR_1" },
            path: "src/model.mts",
            line: 3,
            startLine: null,
            createdAt: at,
            updatedAt: at,
          })),
        },
      })),
    },
    commits: {
      totalCount: 1,
      nodes: [
        {
          commit: {
            oid: HEADS[layer.number],
            committedDate: at,
            checkSuites: suite(layer),
            statusCheckRollup: {
              state: layer.runs.some((run) => run.conclusion === "FAILURE") ? "FAILURE" : "SUCCESS",
              contexts: {
                totalCount: contexts(layer, true).length,
                pageInfo: { hasPreviousPage: false, startCursor: null },
                nodes: contexts(layer, true),
              },
            },
          },
        },
      ],
    },
  };
}

/** `PollStackSummary`'s answer. */
export function stackSummaryResponse(model: LayerModel[]) {
  return {
    data: {
      viewer: { login: "me" },
      repository: {
        viewerPermission: "ADMIN",
        viewerCanAdminister: true,
        mergeCommitAllowed: true,
        squashMergeAllowed: true,
        rebaseMergeAllowed: false,
        pullRequest: {
          stack: {
            id: "STACK_7",
            number: 7,
            size: model.length,
            baseRefName: "main",
            entries: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: model.map((layer, index) => ({
                position: index + 1,
                pullRequest: summaryLayer(layer, model),
              })),
            },
          },
        },
      },
    },
  };
}

/** `StackHandoffCheckRuns`'s answer for the requested ids. */
export function checkRunsResponse(model: LayerModel[], ids: string[]) {
  const runs = new Map(
    model.flatMap((layer) =>
      layer.runs.map((run) => [
        run.id,
        {
          __typename: "CheckRun",
          id: run.id,
          title: `${run.name} title`,
          summary: `${run.name} summary`,
          annotations: annotation(run),
        },
      ]),
    ),
  );
  return { data: { nodes: ids.map((id) => runs.get(id) ?? null) } };
}

const firstPage = { hasPreviousPage: false, startCursor: null };
const lastPage = { hasNextPage: false, endCursor: null };

/** `BatchPr`'s first page for one layer, in the query's own field order. */
export function batchPage(layer: LayerModel, model: LayerModel[]) {
  const reviewNode = (item: Review) => ({
    id: item.id,
    isMinimized: item.isMinimized,
    viewerCanMinimize: true,
    authorAssociation: "MEMBER",
    author,
    body: item.body,
    createdAt: item.createdAt,
    url: url(layer, item.id),
  });
  const reviews = (state: string) => layer.reviews.filter((item) => item.state === state);
  const bottom = model[0]!;
  return {
    viewer: { login: "me" },
    repository: {
      viewerPermission: "ADMIN",
      viewerCanAdminister: true,
      mergeCommitAllowed: true,
      squashMergeAllowed: true,
      rebaseMergeAllowed: false,
      pullRequest: {
        id: `PR_${layer.number}`,
        number: layer.number,
        updatedAt: at,
        state: "OPEN",
        isDraft: false,
        viewerDidAuthor: true,
        viewerCanUpdate: true,
        viewerCanEnableAutoMerge: true,
        viewerCanEditFiles: true,
        mergeable: "MERGEABLE",
        mergeStateStatus: "BLOCKED",
        reviewDecision: layer.reviewDecision,
        headRefOid: HEADS[layer.number],
        headRefName: layer.headRefName,
        headRepository: { nameWithOwner: "octocat/hello-world", viewerPermission: "ADMIN" },
        baseRefName: layer.baseRefName,
        baseRefOid: layer.baseRefOid,
        baseRef: baseRef(layer),
        isInMergeQueue: false,
        isMergeQueueEnabled: false,
        autoMergeRequest: null,
        mergeQueueEntry: null,
        mergeQueueAdditions: { nodes: [] },
        mergeQueueRemovals: { nodes: [] },
        mergeQueueRemovalTimes: { nodes: [] },
        headRefForcePushes: { nodes: [] },
        stack: {
          id: "STACK_7",
          number: 7,
          size: model.length,
          baseRefName: "main",
          entries: { pageInfo: lastPage, nodes: stackFields(model) },
          trunkEntry: {
            nodes: [{ pullRequest: { baseRefName: bottom.baseRefName, baseRef: baseRef(bottom) } }],
          },
        },
        stackEntry: { position: model.indexOf(layer) + 1 },
        reviewRequests: {
          nodes: layer.teamReviewer
            ? [
                { requestedReviewer: { name: "core" } },
                { requestedReviewer: { login: "lead" } },
                { requestedReviewer: {} },
                { requestedReviewer: null },
              ]
            : [],
        },
        latestReviews: { nodes: layer.reviews.map((item) => ({ author, state: item.state })) },
        reviewThreads: {
          totalCount: layer.threads.length,
          pageInfo: firstPage,
          nodes: layer.threads.map((thread) => ({
            id: thread.id,
            isResolved: thread.isResolved,
            isOutdated: false,
            viewerCanReply: true,
            viewerCanResolve: true,
            path: "src/model.mts",
            line: 3,
            startLine: null,
            comments: {
              pageInfo: lastPage,
              nodes: thread.comments.map((body, index) => ({
                id: `${thread.id}_C${index}`,
                isMinimized: false,
                url: `${url(layer, thread.id)}discussion_r${1000 + index}`,
                authorAssociation: "MEMBER",
                viewerDidAuthor: false,
                author,
                pullRequestReview: { id: "PRR_1" },
                body,
                path: "src/model.mts",
                line: 3,
                startLine: null,
                createdAt: at,
                updatedAt: at,
              })),
            },
          })),
        },
        comments: {
          totalCount: layer.comments.length,
          pageInfo: firstPage,
          nodes: layer.comments.map((item) => ({
            id: item.id,
            isMinimized: item.isMinimized,
            viewerCanMinimize: true,
            url: url(layer, item.id),
            authorAssociation: "MEMBER",
            author,
            body: item.body,
            createdAt: at,
            updatedAt: at,
          })),
        },
        changesRequestedReviews: {
          pageInfo: firstPage,
          nodes: reviews("CHANGES_REQUESTED").map((item) => ({
            id: item.id,
            authorAssociation: "MEMBER",
            author,
            body: item.body,
            createdAt: item.createdAt,
            commit: { oid: HEADS[layer.number] },
          })),
        },
        reviewSummaries: { pageInfo: firstPage, nodes: reviews("COMMENTED").map(reviewNode) },
        allReviews: {
          totalCount: layer.reviews.length,
          nodes: layer.reviews.map((item) => ({ id: item.id, updatedAt: item.updatedAt })),
        },
        approvedReviews: { pageInfo: firstPage, nodes: reviews("APPROVED").map(reviewNode) },
        commits: {
          totalCount: 1,
          nodes: [
            {
              commit: {
                oid: HEADS[layer.number],
                committedDate: at,
                checkSuites: suite(layer),
                statusCheckRollup: {
                  state: layer.runs.some((run) => run.conclusion === "FAILURE")
                    ? "FAILURE"
                    : "SUCCESS",
                  contexts: { pageInfo: lastPage, nodes: contexts(layer, false) },
                },
              },
            },
          ],
        },
      },
    },
  };
}
