import { describe, expect, it } from "vitest";
import {
  serve,
  wire,
  repo,
  prefix,
  pull,
  comment,
} from "../../test-helpers/github/rest-read.test-support.mts";
import { runWithGithubTransport } from "./transport.mts";
import { getPullRequestBody, updatePullRequestBody } from "./client.mts";
import { fetchPrFingerprint } from "./fingerprint.mts";
import { fetchSuggestionThreads } from "./suggestion-thread.mts";
import { readRestFeedback } from "./rest-feedback-read.mts";
import { hydrateThreadCommentPages } from "./thread-comments.mts";
import { fetchCheckRunAnnotationsBatch } from "./check-annotations-batch.mts";
import {
  hydrateReadyAnnotationProbe,
  annotationProbeUnavailable,
} from "./poll-summary-annotation-probe.mts";
import { hydratePollSummaryChecks } from "./poll-summary-check-hydration.mts";
import { loadBaseBehindBy, loadRefRules } from "./merge-target-rules.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

const check = {
  id: 77,
  node_id: "CR_77",
  name: "ci",
  status: "completed",
  conclusion: "success",
  details_url: null,
  started_at: null,
  completed_at: null,
  check_suite: null,
  output: { title: null, summary: null, annotations_count: 2 },
};

function rawSummary(
  nodes = [
    {
      __typename: "CheckRun",
      id: "CR_77",
      name: "ci",
      status: "COMPLETED",
      conclusion: "SUCCESS",
      checkSuite: null,
    },
  ],
): RawSummaryPr {
  return {
    number: 101,
    state: "OPEN",
    isDraft: false,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    commits: {
      nodes: [
        {
          commit: {
            oid: "aaa111",
            statusCheckRollup: {
              contexts: {
                totalCount: nodes.length,
                nodes,
                pageInfo: { hasPreviousPage: false },
              },
            },
          },
        },
      ],
    },
  } as RawSummaryPr;
}

async function server(annotationStatus = 200) {
  await serve((request, response) => {
    const path = request.path.split("?")[0];
    if (path === `${prefix}/pulls/101`) response.end(JSON.stringify(pull));
    else if (path?.endsWith("/pulls/101/comments")) response.end(JSON.stringify([comment(11)]));
    else if (path?.endsWith("check-runs"))
      response.end(JSON.stringify({ total_count: 1, check_runs: [check] }));
    else if (path?.endsWith("check-suites")) response.end('{"total_count":0,"check_suites":[]}');
    else if (path?.endsWith("actions/runs")) response.end('{"total_count":0,"workflow_runs":[]}');
    else if (path?.endsWith("annotations")) {
      response.statusCode = annotationStatus;
      if (annotationStatus === 429) response.setHeader("retry-after", "20");
      response.end(annotationStatus === 200 ? "[]" : '{"message":"denied"}');
    } else if (path?.endsWith("protection")) {
      response.statusCode = 403;
      response.end('{"message":"Resource not accessible by integration"}');
    } else if (path?.includes("compare")) response.end('{"behind_by":4}');
    else response.end("[]");
  });
}

describe("REST operation boundaries", () => {
  it("updates a previously fetched opaque pull ID using the REST body contract", async () => {
    await server();
    await runWithGithubTransport("rest", async () => {
      const current = await getPullRequestBody(101, repo.owner, repo.name);
      await updatePullRequestBody(current.nodeId, "updated journal");
    });
    expect(wire.requests).toMatchObject([
      { method: "GET", path: `${prefix}/pulls/101` },
      { method: "PATCH", path: `${prefix}/pulls/101`, body: { body: "updated journal" } },
    ]);
  });

  it("refuses an incomplete cheap fingerprint instead of certifying a REST receipt", async () => {
    await server();
    await expect(
      runWithGithubTransport("rest", () => fetchPrFingerprint(101, repo)),
    ).rejects.toThrow("read a full PR snapshot instead");
    expect(wire.requests).toEqual([]);
  });

  it("keeps unknown suggestion IDs separate from complete stored thread transcripts", async () => {
    await server();
    await runWithGithubTransport("rest", async () => {
      const result = await fetchSuggestionThreads(101, repo, ["unknown-opaque-thread"]);
      expect(result.threads).toEqual([null]);
      const feedback = await readRestFeedback(101, repo);
      const incomplete = {
        id: feedback.threads[0]!.id,
        comments: { pageInfo: { hasNextPage: true, endCursor: "old" }, nodes: [] },
      };
      const complete = {
        id: "complete",
        comments: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
      };
      const hydrated = await hydrateThreadCommentPages([incomplete, complete]);
      expect(hydrated.threads[0]?.comments.nodes).toMatchObject([{ body: "feedback 11" }]);
      expect(hydrated.threads[1]).toEqual(complete);
    });
  });

  it.each([403, 429])(
    "records ordinary annotation denials but propagates throttling (%i)",
    async (status) => {
      await server(status);
      const action = runWithGithubTransport("rest", () =>
        fetchCheckRunAnnotationsBatch(["CR_77"], {
          stateKey: { owner: repo.owner, repo: repo.name, pr: 101 },
          headSha: "aaa111",
        }),
      );
      if (status === 429)
        await expect(action).rejects.toMatchObject({ status: 429, retryAfterSeconds: 20 });
      else
        expect(await action).toMatchObject({
          failures: [{ checkRunId: "CR_77", error: expect.objectContaining({ status: 403 }) }],
        });
    },
  );

  it("hydrates missing annotation totals from REST on an otherwise ready summary", async () => {
    await server();
    const raw = rawSummary();
    await runWithGithubTransport("rest", () => hydrateReadyAnnotationProbe(raw, repo, {}));
    expect(raw.commits.nodes[0]?.commit.statusCheckRollup?.contexts.nodes[0]).toMatchObject({
      annotations: { totalCount: 2 },
    });
    expect(annotationProbeUnavailable(raw)).toBe(false);
  });

  it("replaces a partial GraphQL check window with complete REST evidence", async () => {
    await server();
    const raw = rawSummary();
    const contexts = raw.commits.nodes[0]!.commit.statusCheckRollup!.contexts;
    contexts.pageInfo = { hasPreviousPage: true, startCursor: "older" };
    await runWithGithubTransport("rest", () => hydratePollSummaryChecks(raw, repo));
    expect(raw.commits.nodes[0]?.commit.statusCheckRollup?.contexts.pageInfo.hasPreviousPage).toBe(
      false,
    );
    expect(raw.commits.nodes[0]?.commit.statusCheckRollup?.contexts.nodes).toHaveLength(1);
  });

  it("surfaces unavailable target branch policy and independently reads base ancestry", async () => {
    await server();
    await runWithGithubTransport("rest", async () => {
      await expect(
        loadRefRules(repo.owner, repo.name, "refs/heads/main", "aaa111"),
      ).rejects.toThrow("unavailable");
      expect(await loadBaseBehindBy(repo.owner, repo.name, "main", "aaa111")).toBe(4);
    });
  });
});
