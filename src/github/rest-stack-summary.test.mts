import { describe, expect, it } from "vitest";
import { repo, pull, wire } from "../../test-helpers/github/rest-read.test-support.mts";
import { serveRestSnapshot } from "../../test-helpers/github/rest-snapshot.test-support.mts";
import { readRestStackSummary } from "./rest-stack-summary.mts";
import { fetchPollSummary } from "./poll-summary.mts";
import { runWithGithubTransport } from "./transport.mts";

const stack = {
  number: 42,
  node_id: "S_42",
  base: { ref: "main" },
  pull_requests: [{ number: 101 }],
};

describe("REST native stack summary", () => {
  it("routes public stack polling through REST summaries and preserves their projection", async () => {
    await serveRestSnapshot({ stack });
    const result = await runWithGithubTransport("rest", () =>
      fetchPollSummary({ stackPrNumber: 101 }, repo),
    );
    expect(result).toMatchObject({
      selection: { kind: "stack", anchor: 101, stackNumber: 42, stackSize: 1 },
      allowedMergeMethods: ["merge", "squash"],
      prs: [
        {
          pr: 101,
          transport: "rest",
          headRefOid: pull.head.sha,
          stack: { number: 42, position: 1 },
        },
      ],
    });
    expect(wire.requests.some((request) => request.path === "/graphql")).toBe(false);
  });
  it("combines complete member snapshots with verified topology and actual merge settings", async () => {
    await serveRestSnapshot({ stack });
    const result = await readRestStackSummary(101, repo);
    expect(result).toMatchObject({
      stackNumber: 42,
      stackSize: 1,
      allowedMergeMethods: ["merge", "squash"],
      ordered: [
        {
          number: 101,
          headRefOid: pull.head.sha,
          stackEntry: { position: 1 },
          transport: "rest",
          comments: { totalCount: 0 },
          reviewThreads: { totalCount: 0 },
        },
      ],
    });
    expect(result).not.toHaveProperty("viewerCanAdminister");
  });

  it("rejects a stack member head that changes after the member snapshot", async () => {
    await serveRestSnapshot({
      stack,
      pull: (read) => ({ head: { ...pull.head, sha: read > 3 ? "new-head" : pull.head.sha } }),
    });
    await expect(readRestStackSummary(101, repo)).rejects.toThrow(
      "Native stack changed during REST summary read",
    );
  });
});
