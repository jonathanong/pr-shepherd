import { describe, expect, it } from "vitest";
import {
  wire,
  serve,
  comment,
  pull,
  repo,
  prefix,
} from "../../test-helpers/github/rest-read.test-support.mts";
import { runWithGithubTransport } from "./transport.mts";
import { fetchPrBatch } from "./batch.mts";
import { getPrHeadSha, getPullRequestBody, getPrNumberForBranch } from "./client.mts";
import { fetchRawSummaryPr } from "./poll-summary.mts";
import { fetchSuggestionThreads } from "./suggestion-thread.mts";
import { fetchReplyThreadTranscripts } from "./reply-thread-transcripts.mts";
import { isCurrentSummaryReady } from "./poll-summary-readiness.mts";
import { summarizePollSummaryChecks } from "./poll-summary-checks.mts";
describe("REST high-level operation selection", () => {
  async function snapshotServer(
    heads = ["aaa111"],
    states = ["clean"],
    withComments = true,
    autoMerges: Array<Record<string, unknown> | null> = [],
  ) {
    let pulls = 0;
    await serve((request, response) => {
      const path = request.path.split("?")[0];
      if (path === `${prefix}/pulls/101`) {
        const revision = pulls++;
        const state = states[Math.min(revision, states.length - 1)]!;
        const autoMerge = autoMerges[Math.min(revision, autoMerges.length - 1)];
        response.end(
          JSON.stringify({
            ...pull,
            ...(autoMerges.length > 0 && { auto_merge: autoMerge }),
            head: { ...pull.head, sha: heads[Math.min(revision, heads.length - 1)] },
            mergeable: state !== "dirty",
            mergeable_state: state,
          }),
        );
      } else if (path === `${prefix}/pulls`)
        response.end(JSON.stringify([{ number: 101, head: { ref: pull.head.ref } }]));
      else if (path === prefix)
        response.end(
          '{"allow_merge_commit":true,"allow_squash_merge":true,"allow_rebase_merge":false}',
        );
      else if (path?.endsWith("/protection")) {
        response.statusCode = 403;
        response.end('{"message":"Resource not accessible by integration"}');
      } else if (path?.endsWith("check-runs")) response.end('{"total_count":0,"check_runs":[]}');
      else if (path?.endsWith("check-suites")) response.end('{"total_count":0,"check_suites":[]}');
      else if (path?.endsWith("actions/runs")) response.end('{"total_count":0,"workflow_runs":[]}');
      else if (path?.endsWith("/pulls/101/comments"))
        response.end(JSON.stringify(withComments ? [comment(11), comment(12, 11)] : []));
      else response.end("[]");
    });
  }
  it("fetches batch, receipt evidence, lookups, suggestions and transcripts through REST adapters", async () => {
    await snapshotServer();
    await runWithGithubTransport("rest", async () => {
      const batch = await fetchPrBatch(101, repo, { includeReceiptSummary: true });
      expect(batch.data).toMatchObject({
        transport: "rest",
        mergeStateStatus: "CLEAN",
        stack: null,
        allowedMergeMethods: ["merge", "squash"],
      });
      expect(batch.data).not.toHaveProperty("viewerAuthorization");
      expect(batch.data).not.toHaveProperty("isInMergeQueue");
      expect(batch.receiptSummary).toMatchObject({
        headRefOid: "aaa111",
        reviewThreads: { totalCount: 1 },
      });
      expect(await getPrHeadSha(101, repo.owner, repo.name)).toBe("aaa111");
      expect(await getPullRequestBody(101, repo.owner, repo.name)).toEqual({
        nodeId: "PR_101",
        body: "PR body",
      });
      expect(await getPrNumberForBranch("user-model", repo.owner, repo.name)).toBe(101);
      expect(await fetchRawSummaryPr(101, repo)).toMatchObject({ transport: "rest", number: 101 });
      expect(await fetchSuggestionThreads(101, repo, ["rest-thread-11"])).toMatchObject({
        threads: [{ id: "rest-thread-11", line: 5 }],
      });
      expect(
        (await fetchReplyThreadTranscripts(101, repo, ["rest-thread-11"])).get("rest-thread-11"),
      ).toContain("feedback 12");
    });
    expect(
      wire.requests.every((request) => request.method === "GET" && request.path !== "/graphql"),
    ).toBe(true);
  });
  it("retries a changed revision and fails when both bounded snapshots drift", async () => {
    await snapshotServer(["a", "b", "c", "d"]);
    await expect(runWithGithubTransport("rest", () => fetchPrBatch(101, repo))).rejects.toThrow(
      "changed while REST snapshot",
    );
    expect(wire.requests.filter((request) => request.path === `${prefix}/pulls/101`)).toHaveLength(
      4,
    );
  });

  it("projects REST auto-merge method and enabler without inventing an enable timestamp", async () => {
    const autoMerge = { enabled_by: { login: "octocat" }, merge_method: "squash" };
    await snapshotServer(["aaa111"], ["clean"], false, [autoMerge]);

    const batch = await runWithGithubTransport("rest", () =>
      fetchPrBatch(101, repo, { includeReceiptSummary: true }),
    );
    expect(batch.data.autoMergeRequest).toEqual({
      mergeMethod: "SQUASH",
      enabledBy: "octocat",
    });
    expect(batch.data.autoMergeRequest).not.toHaveProperty("enabledAtUnix");
    expect(batch.receiptSummary?.autoMergeRequest).toEqual(batch.data.autoMergeRequest);
  });

  it("retries when REST auto-merge changes during the snapshot read", async () => {
    const autoMerge = { enabled_by: { login: "octocat" }, merge_method: "squash" };
    await snapshotServer(["aaa111"], ["clean"], false, [null, autoMerge, autoMerge]);

    const batch = await runWithGithubTransport("rest", () => fetchPrBatch(101, repo));
    expect(batch.data.autoMergeRequest).toEqual({ mergeMethod: "SQUASH", enabledBy: "octocat" });
    expect(wire.requests.filter((request) => request.path === `${prefix}/pulls/101`)).toHaveLength(
      4,
    );
  });
  it.each(["dirty", "blocked"])(
    "retries CLEAN to %s with unchanged head, base and updated_at before certifying readiness",
    async (state) => {
      await snapshotServer(["aaa111"], ["clean", state], false);
      const batch = await runWithGithubTransport("rest", () =>
        fetchPrBatch(101, repo, { includeReceiptSummary: true }),
      );
      expect(batch.data).toMatchObject({
        headRefOid: pull.head.sha,
        baseRefOid: pull.base.sha,
        mergeStateStatus: state.toUpperCase(),
      });
      const summary = batch.receiptSummary!;
      expect(summary.updatedAt).toBe(pull.updated_at);
      expect(isCurrentSummaryReady(summary, summarizePollSummaryChecks(summary), {})).toBe(false);
      expect(
        wire.requests.filter((request) => request.path === `${prefix}/pulls/101`),
      ).toHaveLength(4);
    },
  );
});
