import { describe, expect, it } from "vitest";
import { dropNullNodes } from "./null-nodes.mts";

const nullsOf = () => ({ nodes: [null] });
const withCommit = (field: object) => ({ commits: { nodes: [{ commit: field }] } });

describe("dropNullNodes — response keys of the query shapes", () => {
  it.each([
    "comments",
    "reviewThreads",
    "reviews",
    "latestReviews",
    "reviewRequests",
    "allReviews",
    "approvedReviews",
    "changesRequestedReviews",
    "reviewSummaries",
    "timelineItems",
    "mergeQueueAdditions",
    "mergeQueueRemovals",
    "trunkEntry",
    "rules",
  ])("files a null under %s as feedback, never as checks", (key) => {
    expect(dropNullNodes({ [key]: { nodes: [null] } })).toEqual({ feedback: true });
  });

  it.each([
    ["contexts", withCommit({ statusCheckRollup: { contexts: nullsOf() } })],
    ["checkSuites", withCommit({ checkSuites: nullsOf() })],
    ["commits", { commits: nullsOf() }],
    ["a bare contexts page", { contexts: nullsOf() }],
  ])("files a null in %s as checks, never as feedback", (_label, root) => {
    expect(dropNullNodes(root)).toEqual({ checks: true });
  });

  it("ignores history-only aliases and commit parents in either shape", () => {
    expect(
      dropNullNodes({
        prCommitOids: nullsOf(),
        mergeQueueRemovalTimes: nullsOf(),
        headRefForcePushes: nullsOf(),
        ...withCommit({ parents: nullsOf() }),
      }),
    ).toBeUndefined();
  });

  it("keeps check and feedback separate when both are present", () => {
    const root = {
      comments: nullsOf(),
      ...withCommit({ statusCheckRollup: { contexts: nullsOf() } }),
    };
    expect(dropNullNodes(root)).toEqual({ checks: true, feedback: true });
  });
});
