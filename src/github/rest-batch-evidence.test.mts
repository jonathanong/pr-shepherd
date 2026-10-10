import { describe, expect, it } from "vitest";
import { repo } from "../../test-helpers/github/rest-read.test-support.mts";
import {
  serveRestSnapshot,
  suite,
  workflow,
  check,
} from "../../test-helpers/github/rest-snapshot.test-support.mts";
import { fetchRestPrBatch } from "./rest-batch-read.mts";
import { readRestCommitChecks, readRestAnnotationCounts } from "./rest-check-read.mts";

describe("REST batch workflow and review evidence", () => {
  it("surfaces startup failures, pending suites, annotation totals and requested users/teams", async () => {
    await serveRestSnapshot({
      pull: {
        requested_reviewers: [{ login: "reviewer" }],
        requested_teams: [{ name: "platform" }],
      },
      checks: [check],
      suites: [suite, { ...suite, id: 67, node_id: "CS_67", status: "queued", conclusion: null }],
      workflows: [workflow],
    });
    const batch = await fetchRestPrBatch(101, repo, { includeReceiptSummary: true });
    expect(batch.data.reviewRequests).toEqual([{ login: "reviewer" }, { login: "platform" }]);
    expect(batch.data.checks).toContainEqual(
      expect.objectContaining({
        source: "startup_failure",
        conclusion: "STARTUP_FAILURE",
        runId: "88",
      }),
    );
    expect(batch.headWorkflowSuites).toEqual([
      {
        status: "COMPLETED",
        conclusion: "STARTUP_FAILURE",
        workflowRun: { event: "pull_request" },
      },
    ]);
    expect(batch.receiptSummary?.reviewRequests?.nodes).toEqual([
      { requestedReviewer: { login: "reviewer" } },
      { requestedReviewer: { login: "platform" } },
    ]);
    expect(batch.receiptSummary?.commits.nodes[0]?.commit.checkSuites?.nodes).toMatchObject([
      { status: "COMPLETED", conclusion: "STARTUP_FAILURE", workflowRun: { id: 88 } },
      { status: "QUEUED", conclusion: null, workflowRun: null },
    ]);
    expect(await readRestAnnotationCounts("aaa111", repo)).toEqual([
      { __typename: "CheckRun", id: "CR_77", annotations: { totalCount: 1 } },
    ]);
  });

  it("rejects an unknown conclusion instead of reporting a successful CI snapshot", async () => {
    await serveRestSnapshot({ checks: [{ ...check, conclusion: "future_conclusion" }] });
    await expect(readRestCommitChecks("aaa111", repo)).rejects.toThrow("unknown check conclusion");
  });

  it("rejects an unknown legacy status state instead of mapping it to completion", async () => {
    await serveRestSnapshot({
      statuses: [{ id: 1, context: "legacy", state: "future_state", created_at: suite.created_at }],
    });
    await expect(readRestCommitChecks("aaa111", repo)).rejects.toThrow(
      "unknown status context state",
    );
  });
});
