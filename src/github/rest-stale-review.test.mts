import { describe, expect, it } from "vitest";
import { wire, repo } from "../../test-helpers/github/rest-read.test-support.mts";
import {
  currentHead,
  previousHead,
  inline,
  review,
  serveStaleReviewFixture,
  thread,
} from "../../test-helpers/github/rest-stale-review.test-support.mts";
import { fetchPrBatch } from "./batch.mts";
import { runWithGithubTransport } from "./transport.mts";
import { runIterate } from "../commands/iterate/index.mts";
import { formatIterateResult } from "../cli/iterate-formatter.mts";
import { projectIterateLean } from "../cli/iterate-lean.mts";

const fetch = () => runWithGithubTransport("rest", () => fetchPrBatch(101, repo));

describe("REST stale changes-requested reviews", () => {
  it.each([
    { name: "resolved", statuses: [thread()] },
    { name: "outdated", statuses: [thread(11, false, true)] },
    {
      name: "mixed resolved/outdated",
      comments: [inline(11, 1), inline(12, 1)],
      statuses: [thread(), thread(12, false, true)],
    },
  ])("marks old human review stale with complete $name evidence", async (fixture) => {
    await serveStaleReviewFixture(fixture);
    const { data } = await fetch();
    expect(data.changesRequestedReviews).toMatchObject([
      {
        id: "PRR_1",
        author: "alice",
        authorType: "User",
        authorAssociation: "MEMBER",
        commitOid: previousHead,
        staleReview: true,
      },
    ]);
    expect(data.reviewThreads.every(({ reviewId }) => reviewId === "PRR_1")).toBe(true);
  });

  it.each([
    { name: "current head review", reviews: [review(1, currentHead)] },
    { name: "active thread", statuses: [thread(11, false, false)] },
    {
      name: "mixed active and resolved threads",
      comments: [inline(11, 1), inline(12, 1)],
      statuses: [thread(), thread(12, false, false)],
    },
    { name: "unassociated thread", comments: [inline(11)] },
    { name: "no associated threads", comments: [], statuses: [] },
    { name: "standard REST unknown thread states", cloud: false },
    { name: "unavailable CCR thread states", missingCcr: true },
  ])("preserves non-stale review for $name", async (fixture) => {
    await serveStaleReviewFixture(fixture);
    const { data } = await fetch();
    expect(data.changesRequestedReviews).toHaveLength(1);
    expect(data.changesRequestedReviews[0]).not.toHaveProperty("staleReview");
    if (fixture.cloud === false || fixture.missingCcr) {
      expect(data.reviewThreads[0]).not.toHaveProperty("isResolved");
      expect(data.reviewThreads[0]).not.toHaveProperty("isOutdated");
    }
  });

  it("associates thread state by review ID rather than shared author", async () => {
    await serveStaleReviewFixture({
      reviews: [review(1), review(2)],
      comments: [inline(11, 1), inline(12, 2)],
      statuses: [thread(), thread(12, false, false)],
    });
    const { data } = await fetch();
    expect(data.reviewThreads.map(({ reviewId }) => reviewId)).toEqual(["PRR_1", "PRR_2"]);
    expect(data.changesRequestedReviews[0]).toMatchObject({ id: "PRR_1", staleReview: true });
    expect(data.changesRequestedReviews[1]).not.toHaveProperty("staleReview");
  });

  it.each([
    { name: "stale", commit: previousHead, action: "fix_code" },
    { name: "current", commit: currentHead, action: "escalate" },
  ])("excludes only $name human review from push-requiring work", async ({ commit, action }) => {
    await serveStaleReviewFixture({ base: "unsafe;base", reviews: [review(1, commit)] });
    const result = await runWithGithubTransport("rest", () =>
      runIterate({
        prNumber: 101,
        targetRepository: repo,
        format: "json",
        readyDelaySeconds: 0,
        stallTimeoutSeconds: 0,
        noAutoMarkReady: true,
      }),
    );
    expect(result.action).toBe(action);
    if (result.action === "escalate")
      expect(result.escalate.triggers).toContain("base-branch-unknown");
    else if (result.action === "fix_code")
      expect(result.fix.instructions.join("\n")).toContain("Ask the reviewer to re-review");
  });

  it("surfaces stale human feedback with re-review instructions and no automated dismissal", async () => {
    await serveStaleReviewFixture();
    const result = await runWithGithubTransport("rest", () =>
      runIterate({
        prNumber: 101,
        targetRepository: repo,
        format: "json",
        readyDelaySeconds: 0,
        stallTimeoutSeconds: 0,
        noAutoMarkReady: true,
      }),
    );
    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") throw new Error(`Unexpected action ${result.action}`);
    expect(result.fix.changesRequestedReviews).toMatchObject([{ id: "PRR_1", staleReview: true }]);
    expect(result.fix.resolveCommand.hasMutations).toBe(false);
    expect(result.fix.resolveCommand.argv).not.toContain("--dismiss-review-ids");
    expect(result.fix.instructions.join("\n")).toContain("Ask the reviewer to re-review");
    expect(formatIterateResult(result)).toContain("ask reviewer to re-review or dismiss");
    expect(projectIterateLean(result)).toMatchObject({
      fix: { changesRequestedReviews: [{ staleReview: true, commitOid: previousHead }] },
    });
    expect(wire.requests.every(({ method }) => method === "GET")).toBe(true);
  });
});
