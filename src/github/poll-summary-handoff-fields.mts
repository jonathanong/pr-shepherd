import type { RawSummaryPr } from "./poll-summary-raw.mts";

/**
 * The GraphQL summary selects these fields only so a routed stack layer's first
 * tick can skip `BatchPr` (see `stack-handoff.mts`). They are not readiness
 * evidence, and some (an edited hidden comment's `updatedAt`) change after a PR
 * settles, so READY-receipt fingerprints leave them out. REST summaries never
 * carry them. A thread comment's `isMinimized` stays: the fingerprint hides
 * minimized bodies, as it already did for comments and reviews.
 */
const COMMENT = ["viewerCanMinimize", "createdAt", "updatedAt"];
const REVIEW = [...COMMENT, "url", "commit"];
const THREAD = ["viewerCanReply", "viewerCanResolve", "line", "startLine"];
const THREAD_COMMENT = ["pullRequestReview", "path", "line", "startLine", "createdAt", "updatedAt"];
const STATUS_CONTEXT = ["createdAt", "targetUrl", "description"];

function omit<T extends object>(value: T, keys: string[]): T {
  const copy = { ...value } as Record<string, unknown>;
  for (const key of keys) delete copy[key];
  return copy as T;
}

function omitEach<T extends object, C extends { nodes: T[] }>(connection: C, keys: string[]): C {
  return { ...connection, nodes: connection.nodes.map((node) => omit(node, keys)) };
}

/** `raw` without the fields only the handoff reads. */
export function withoutHandoffFields(raw: RawSummaryPr): RawSummaryPr {
  if (raw.transport === "rest") return raw;
  return {
    ...raw,
    ...(raw.reviewRequests && {
      reviewRequests: {
        nodes: raw.reviewRequests.nodes.map(({ requestedReviewer }) => ({
          requestedReviewer: requestedReviewer && omit(requestedReviewer, ["name"]),
        })),
      },
    }),
    comments: omitEach(raw.comments, COMMENT),
    reviews: omitEach(raw.reviews, REVIEW),
    reviewThreads: {
      ...raw.reviewThreads,
      nodes: raw.reviewThreads.nodes.map((thread) => ({
        ...omit(thread, THREAD),
        comments: omitEach(thread.comments, THREAD_COMMENT),
      })),
    },
    commits: {
      ...omit(raw.commits, ["totalCount"]),
      nodes: raw.commits.nodes.map(({ commit }) => {
        const rollup = commit.statusCheckRollup;
        return {
          commit: {
            ...commit,
            statusCheckRollup: rollup && {
              ...omit(rollup, ["state"]),
              contexts: {
                ...rollup.contexts,
                nodes: rollup.contexts.nodes.map((node) =>
                  node.__typename === "StatusContext"
                    ? omit(node, STATUS_CONTEXT)
                    : {
                        ...node,
                        checkSuite: node.checkSuite && {
                          ...omit(node.checkSuite, ["updatedAt"]),
                          workflowRun:
                            node.checkSuite.workflowRun &&
                            omit(node.checkSuite.workflowRun, ["updatedAt"]),
                        },
                      },
                ),
              },
            },
          },
        };
      }),
    },
  };
}
