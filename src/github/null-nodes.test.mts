import { describe, expect, it } from "vitest";
import { dropNullNodes, mergeUnread } from "./null-nodes.mts";

describe("dropNullNodes", () => {
  it("returns undefined for a missing root and for a root with no nulls", () => {
    expect(dropNullNodes(undefined)).toBeUndefined();
    expect(dropNullNodes(null)).toBeUndefined();
    expect(dropNullNodes({ comments: { nodes: [{ id: "c" }] }, label: "x" })).toBeUndefined();
  });

  it("drops a null review item and reports feedback unread", () => {
    const root = { comments: { nodes: [null, { id: "c" }] } };
    expect(dropNullNodes(root)).toEqual({ feedback: true });
    expect(root.comments.nodes).toEqual([{ id: "c" }]);
  });

  it("reports a null check context as unread checks", () => {
    const contexts = { nodes: [null] };
    const root = { commits: { nodes: [{ commit: { statusCheckRollup: { contexts } } }] } };
    expect(dropNullNodes(root)).toEqual({ checks: true });
  });

  it("marks the suite page unfinished and reports checks", () => {
    const suites = { pageInfo: { hasNextPage: false }, nodes: [null] };
    expect(dropNullNodes({ commits: { nodes: [{ commit: { checkSuites: suites } }] } })).toEqual({
      checks: true,
    });
    expect(suites).toEqual({ pageInfo: { hasNextPage: true }, nodes: [] });
  });

  it("withholds a whole thread whose comment is null", () => {
    const whole = { id: "t1", comments: { nodes: [{ id: "a" }] } };
    const root = {
      reviewThreads: { nodes: [{ id: "t0", comments: { nodes: [null, { id: "b" }] } }, whole] },
    };
    expect(dropNullNodes(root)).toEqual({ feedback: true });
    expect(root.reviewThreads.nodes).toEqual([whole]);
  });

  it("skips history-only lists and leaves inline annotation nulls to their own handling", () => {
    const run = { __typename: "CheckRun", annotations: { nodes: [null] } };
    const root = {
      headRefForcePushes: { nodes: [null] },
      commits: { nodes: [{ commit: { statusCheckRollup: { contexts: { nodes: [run] } } } }] },
    };
    expect(dropNullNodes(root)).toBeUndefined();
    expect(root.headRefForcePushes.nodes).toEqual([]);
    expect(run.annotations.nodes).toEqual([null]);
  });
});

describe("mergeUnread", () => {
  it("unions the parts and is undefined when none is unread", () => {
    expect(mergeUnread(undefined, undefined)).toBeUndefined();
    expect(mergeUnread({ checks: true }, undefined, { feedback: true })).toEqual({
      checks: true,
      feedback: true,
    });
  });
});
