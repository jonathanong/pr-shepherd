/* eslint-disable max-lines */
import type { RawBatchResponse, RawContextNode, RawPr } from "./batch-raw-types.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";
import type { StackRead } from "./stack-read.mts";

/**
 * A routed stack layer's `BatchPr` first page, rebuilt from the stack summary
 * that routed it. See `stack-handoff.mts` for when a handoff is stored and read.
 */
const MAX_THREAD_COMMENTS = 5;
const MAX_REVIEW_BUCKET = 50;
const MAX_LATEST_REVIEWS = 50;
const MAX_CONTEXTS = 100;
const MAX_STACK_ENTRIES = 50;

/** The routing tick's summary read: every layer as read, before projection. */
export interface StackHandoffSource {
  read: Omit<StackRead<RawSummaryPr>, "ordered">;
  layers: RawSummaryPr[];
  readAt: number;
}

export type CheckRunDetail = Pick<
  Extract<RawContextNode, { __typename: "CheckRun" }>,
  "title" | "summary" | "annotations"
>;

function headCommit(layer: RawSummaryPr) {
  return layer.commits.nodes[0]?.commit;
}

export function checkRunIds(layer: RawSummaryPr): string[] {
  return (headCommit(layer)?.statusCheckRollup?.contexts.nodes ?? []).flatMap((node) =>
    node.__typename === "CheckRun" && node.id ? [node.id] : [],
  );
}

function reviewsIn(layer: RawSummaryPr, state: string) {
  return layer.reviews.nodes.filter((review) => review.state === state);
}

/** True when every window `BatchPr`'s first page reads is complete in this summary. */
export function summaryComplete(layer: RawSummaryPr, source: StackHandoffSource): boolean {
  const { read } = source;
  if (!read.stack || read.viewerPermission === undefined || !read.mergeSettings) return false;
  if (source.layers.length > MAX_STACK_ENTRIES || !layer.stack || !layer.stackEntry) return false;
  if (layer.state !== "OPEN" || layer.id === undefined || layer.viewerDidAuthor === undefined)
    return false;
  if (layer.isInMergeQueue || layer.mergeQueueEntry || layer.mergeQueueRemovals?.nodes.length)
    return false;
  if (
    layer.comments.pageInfo.hasPreviousPage ||
    layer.reviews.pageInfo.hasPreviousPage ||
    layer.reviewThreads.pageInfo.hasPreviousPage ||
    layer.reviewThreads.nodes.some(
      (thread) =>
        thread.comments.pageInfo.hasPreviousPage ||
        thread.comments.nodes.length > MAX_THREAD_COMMENTS,
    )
  )
    return false;
  if (
    ["CHANGES_REQUESTED", "COMMENTED", "APPROVED"].some(
      (state) => reviewsIn(layer, state).length > MAX_REVIEW_BUCKET,
    )
  )
    return false;
  if ((layer.latestReviews?.nodes.length ?? MAX_LATEST_REVIEWS) >= MAX_LATEST_REVIEWS) return false;
  if (!layer.reviewRequests || layer.commits.totalCount === undefined) return false;
  const commit = headCommit(layer);
  if (!commit || commit.oid !== layer.headRefOid || !commit.checkSuites?.pageInfo) return false;
  const contexts = commit.statusCheckRollup?.contexts;
  if (
    contexts &&
    (contexts.pageInfo.hasPreviousPage ||
      contexts.totalCount > MAX_CONTEXTS ||
      contexts.nodes.length !== contexts.totalCount)
  )
    return false;
  return true;
}

const firstPage = { hasPreviousPage: false, startCursor: null };
const lastPage = { hasNextPage: false, endCursor: null };

/** The `BatchPr` first page this layer's summary answers, field by field; null if incomplete. */
export function batchResponseFromSummary(
  layer: RawSummaryPr,
  source: StackHandoffSource,
  runs: ReadonlyMap<string, CheckRunDetail>,
): RawBatchResponse | null {
  if (!summaryComplete(layer, source)) return null;
  const commit = headCommit(layer)!;
  const rollup = commit.statusCheckRollup;
  const contexts: RawContextNode[] = [];
  for (const node of rollup?.contexts.nodes ?? []) {
    if (node.__typename === "StatusContext") {
      contexts.push({
        __typename: "StatusContext",
        context: node.context,
        state: node.state,
        ...(node.createdAt !== undefined && { createdAt: node.createdAt }),
        targetUrl: node.targetUrl ?? null,
        description: node.description ?? null,
      });
      continue;
    }
    const run = node.id ? runs.get(node.id) : undefined;
    if (!run) return null;
    const suite = node.checkSuite;
    const workflowRun = suite?.workflowRun;
    contexts.push({
      __typename: "CheckRun",
      id: node.id!,
      name: node.name,
      status: node.status,
      conclusion: node.conclusion,
      detailsUrl: node.detailsUrl ?? null,
      completedAt: node.completedAt ?? null,
      startedAt: node.startedAt ?? null,
      title: run.title,
      summary: run.summary,
      ...(run.annotations && { annotations: run.annotations }),
      checkSuite: suite
        ? {
            ...(suite.status && { status: suite.status }),
            ...(suite.createdAt && { createdAt: suite.createdAt }),
            ...(suite.updatedAt && { updatedAt: suite.updatedAt }),
            workflowRun: workflowRun
              ? {
                  event: workflowRun.event,
                  ...(workflowRun.createdAt && { createdAt: workflowRun.createdAt }),
                  ...(workflowRun.updatedAt && { updatedAt: workflowRun.updatedAt }),
                  workflow: workflowRun.workflow
                    ? {
                        name: workflowRun.workflow.name,
                        databaseId: workflowRun.workflow.databaseId as number,
                      }
                    : null,
                }
              : null,
          }
        : null,
    });
  }
  const { read } = source;
  const stack = read.stack!;
  const bottom = source.layers[0]!;
  const reviewSummary = (review: RawSummaryPr["reviews"]["nodes"][number]) => ({
    id: review.id,
    isMinimized: review.isMinimized === true,
    viewerCanMinimize: review.viewerCanMinimize === true,
    authorAssociation: review.authorAssociation as never,
    author: review.author,
    body: review.body,
    createdAt: review.createdAt,
    url: review.url,
  });
  const pullRequest: RawPr = {
    id: layer.id!,
    number: layer.number,
    updatedAt: layer.updatedAt,
    state: layer.state,
    isDraft: layer.isDraft,
    viewerDidAuthor: layer.viewerDidAuthor === true,
    viewerCanUpdate: layer.viewerCanUpdate === true,
    viewerCanEnableAutoMerge: layer.viewerCanEnableAutoMerge === true,
    viewerCanEditFiles: layer.viewerCanEditFiles === true,
    mergeable: layer.mergeable,
    mergeStateStatus: layer.mergeStateStatus,
    reviewDecision: layer.reviewDecision,
    headRefOid: layer.headRefOid,
    headRefName: layer.headRefName,
    headRepository: layer.headRepository ?? null,
    baseRefName: layer.baseRefName,
    baseRefOid: layer.baseRefOid,
    baseRef: layer.baseRef ?? null,
    isInMergeQueue: false,
    isMergeQueueEnabled: layer.isMergeQueueEnabled === true,
    autoMergeRequest: layer.batchAutoMergeRequest ?? null,
    mergeQueueEntry: null,
    mergeQueueAdditions: layer.mergeQueueAdditions ?? { nodes: [] },
    mergeQueueRemovals: { nodes: [] },
    mergeQueueRemovalTimes: { nodes: [] },
    headRefForcePushes: layer.headRefForcePushes ?? { nodes: [] },
    stack: {
      id: stack.id,
      number: layer.stack!.number,
      size: layer.stack!.size,
      baseRefName: layer.stack!.baseRefName,
      entries: {
        pageInfo: lastPage,
        nodes: source.layers.map((member, index) => ({
          position: stack.positions[index]!,
          pullRequest: {
            number: member.number,
            state: member.state,
            headRefName: member.headRefName,
            headRefOid: member.headRefOid,
            baseRefName: member.baseRefName,
            baseRefOid: member.baseRefOid,
          },
        })),
      },
      trunkEntry: {
        nodes: [
          { pullRequest: { baseRefName: bottom.baseRefName, baseRef: bottom.baseRef ?? null } },
        ],
      },
    },
    stackEntry: layer.stackEntry,
    reviewRequests: {
      nodes: layer.reviewRequests!.nodes.map(({ requestedReviewer: reviewer }) => ({
        requestedReviewer: !reviewer
          ? null
          : reviewer.__typename === "Team"
            ? { name: reviewer.name! }
            : reviewer.__typename === "User" || reviewer.__typename === "Bot"
              ? { login: reviewer.login! }
              : {},
      })),
    },
    latestReviews: {
      nodes: layer.latestReviews!.nodes.map((review) => ({
        author: review.author,
        state: review.state,
      })),
    },
    reviewThreads: {
      totalCount: layer.reviewThreads.totalCount,
      pageInfo: firstPage,
      nodes: layer.reviewThreads.nodes.map((thread) => ({
        id: thread.id,
        isResolved: thread.isResolved,
        isOutdated: thread.isOutdated,
        viewerCanReply: thread.viewerCanReply,
        viewerCanResolve: thread.viewerCanResolve,
        path: thread.path,
        line: thread.line ?? null,
        startLine: thread.startLine ?? null,
        comments: {
          pageInfo: lastPage,
          nodes: thread.comments.nodes.map((comment) => ({
            id: comment.id,
            isMinimized: comment.isMinimized,
            url: comment.url!,
            authorAssociation: comment.authorAssociation as never,
            viewerDidAuthor: comment.viewerDidAuthor,
            author: comment.author,
            pullRequestReview: comment.pullRequestReview ?? null,
            body: comment.body,
            path: comment.path ?? null,
            line: comment.line ?? null,
            startLine: comment.startLine ?? null,
            createdAt: comment.createdAt,
            updatedAt: comment.updatedAt,
          })),
        },
      })),
    },
    comments: {
      totalCount: layer.comments.totalCount,
      pageInfo: firstPage,
      nodes: layer.comments.nodes.map((comment) => ({
        id: comment.id,
        isMinimized: comment.isMinimized === true,
        viewerCanMinimize: comment.viewerCanMinimize === true,
        url: comment.url!,
        authorAssociation: comment.authorAssociation as never,
        author: comment.author,
        body: comment.body,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
      })),
    },
    changesRequestedReviews: {
      pageInfo: firstPage,
      nodes: reviewsIn(layer, "CHANGES_REQUESTED").map((review) => ({
        id: review.id,
        authorAssociation: review.authorAssociation as never,
        author: review.author,
        body: review.body,
        createdAt: review.createdAt,
        ...(review.commit && { commit: review.commit }),
      })),
    },
    reviewSummaries: {
      pageInfo: firstPage,
      nodes: reviewsIn(layer, "COMMENTED").map(reviewSummary),
    },
    allReviews: {
      totalCount: layer.reviews.totalCount,
      nodes: layer.reviews.nodes.map((review) => ({ id: review.id, updatedAt: review.updatedAt })),
    },
    approvedReviews: {
      pageInfo: firstPage,
      nodes: reviewsIn(layer, "APPROVED").map(reviewSummary),
    },
    commits: {
      totalCount: layer.commits.totalCount,
      nodes: [
        {
          commit: {
            oid: commit.oid,
            committedDate: commit.committedDate,
            checkSuites: {
              pageInfo: commit.checkSuites!.pageInfo!,
              nodes: commit.checkSuites!.nodes.map((suite) => ({
                id: suite.id,
                status: suite.status,
                conclusion: suite.conclusion,
                workflowRun: suite.workflowRun
                  ? {
                      databaseId: suite.workflowRun.databaseId ?? null,
                      event: suite.workflowRun.event,
                      url: suite.workflowRun.url ?? null,
                      workflow: suite.workflowRun.workflow ?? null,
                    }
                  : null,
              })),
            },
            statusCheckRollup: rollup
              ? { state: rollup.state ?? null, contexts: { pageInfo: lastPage, nodes: contexts } }
              : null,
          },
        },
      ],
    },
  };
  return {
    viewer: { login: read.viewerLogin },
    repository: {
      viewerPermission: read.viewerPermission ?? null,
      viewerCanAdminister: read.viewerCanAdminister === true,
      ...read.mergeSettings,
      pullRequest,
      receiptSummary: structuredClone(layer),
    },
  };
}
