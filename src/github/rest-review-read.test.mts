import { describe, expect, it } from "vitest";
import { serve, prefix, pull, repo } from "../../test-helpers/github/rest-read.test-support.mts";
import { readRestSnapshot } from "./rest-batch-snapshot.mts";
import { readRestFeedback } from "./rest-feedback-read.mts";
import { deriveMergeStatus } from "../merge-status/derive.mts";
import { restSummary } from "./rest-summary-read.mts";
import { summarizePollSummaryPr } from "./poll-summary-projector.mts";

const review = (id: number, login: string, state: string, submitted_at?: string | null) => ({
  id,
  node_id: `PRR_${id}`,
  body: `review ${id}`,
  html_url: `https://github.com/octocat/hello-world/pull/101#pullrequestreview-${id}`,
  user: { login, type: "User" },
  author_association: "MEMBER",
  state,
  commit_id: "aaa111",
  ...(submitted_at !== undefined && { submitted_at }),
});

describe("REST submitted review evidence", () => {
  it("preserves submitted decisions across draft reviews and orders evidence by submission time", async () => {
    await serve((request, response) => {
      const path = request.path.split("?")[0];
      if (path?.endsWith("/reviews"))
        response.end(
          JSON.stringify([
            review(2, "Copilot-one", "APPROVED", "2026-10-09T00:03:00Z"),
            review(1, "copilot-one", "CHANGES_REQUESTED", "2026-10-09T00:01:00Z"),
            review(3, "copilot-one", "PENDING", null),
            review(5, "Copilot-two", "PENDING"),
            review(4, "copilot-two", "CHANGES_REQUESTED", "2026-10-09T00:02:00Z"),
          ]),
        );
      else if (path === prefix)
        response.end(
          '{"allow_merge_commit":true,"allow_squash_merge":true,"allow_rebase_merge":false}',
        );
      else if (path?.endsWith("/protection")) {
        response.statusCode = 404;
        response.end('{"message":"Not Found"}');
      } else if (path?.endsWith("check-runs")) response.end('{"total_count":0,"check_runs":[]}');
      else if (path?.endsWith("check-suites")) response.end('{"total_count":0,"check_suites":[]}');
      else if (path?.endsWith("actions/runs")) response.end('{"total_count":0,"workflow_runs":[]}');
      else response.end("[]");
    });
    const snapshot = await readRestSnapshot(pull, repo);
    expect(snapshot.data.latestReviews).toEqual([
      { login: "copilot-one", state: "PENDING" },
      { login: "Copilot-two", state: "PENDING" },
      { login: "Copilot-one", state: "APPROVED" },
      { login: "copilot-two", state: "CHANGES_REQUESTED" },
    ]);
    expect(snapshot.data.changesRequestedReviews.map((item) => item.id)).toEqual(["PRR_4"]);
    expect(snapshot.feedback.reviews.filter((item) => item.state === "PENDING")).toHaveLength(2);
    expect(deriveMergeStatus(snapshot.data)).toMatchObject({
      status: "BLOCKED",
      blockingBotReviewInProgress: true,
    });
    const summary = restSummary(
      snapshot.data,
      pull,
      snapshot.feedback,
      snapshot.checks,
      snapshot.rules.baseRef,
    );
    expect(await summarizePollSummaryPr(summary, repo, {})).toMatchObject({
      blockingReviewerInProgress: true,
    });
  });

  it.each([
    ["missing submitted timestamp", review(1, "alice", "APPROVED")],
    ["unknown review state", review(1, "alice", "NEW_STATE", "2026-10-09T00:03:00Z")],
  ])("rejects %s instead of supplying incomplete decisions", async (_name, invalid) => {
    await serve((request, response) =>
      response.end(JSON.stringify(request.path.includes("/reviews") ? [invalid] : [])),
    );
    await expect(readRestFeedback(101, repo)).rejects.toThrow(
      "Malformed or incomplete GitHub REST response",
    );
  });
});
