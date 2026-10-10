import { expect } from "vitest";
import { wire, serve, pull, repo, prefix } from "./rest-read.test-support.mts";
import { runWithGithubTransport } from "../../src/github/transport.mts";
import { fetchRawSummaryPr } from "../../src/github/poll-summary.mts";
import { fingerprintRawSummaryPr } from "../../src/github/poll-summary-fingerprint.mts";
import { writeReadyReceipt } from "../../src/state/ready-receipts.mts";
import { runApplyMerge } from "../../src/commands/apply-merge.mts";
import type { RestMergeStackGuard } from "../../src/github/rest-merge.mts";

export const lowerSha = "a".repeat(40);
export const upperSha = "c".repeat(40);
export const stack = {
  number: 42,
  node_id: "STACK_42",
  base: { ref: "main" },
  pull_requests: [{ number: 101 }, { number: 102 }],
};
export const expectedStack: RestMergeStackGuard = {
  number: 42,
  baseRefName: "main",
  prefix: [
    { pr: 101, headRefName: "user-model", headRefOid: lowerSha, baseRefName: "main" },
    { pr: 102, headRefName: "user-api", headRefOid: upperSha, baseRefName: "user-model" },
  ],
};

export async function stackedServer() {
  const fixture = {
    nativeStack: structuredClone(stack) as typeof stack | null,
    dropStackDuringValidation: false,
    changeMembershipAfterFinalTopology: false,
    changeMembershipAfterInitialTopology: undefined as "identity" | "trunk" | undefined,
    viewerReads: 0,
    viewerStatus: 200,
    viewerMessage: "Resource not accessible by integration",
    viewerHeaders: {} as Record<string, string>,
    upperBaseSha: lowerSha,
    lowerHeadSha: lowerSha,
    upperBaseName: "user-model",
    upperHeadSha: upperSha,
    changeDuringValidation: false,
    bottomState: "open",
    bottomBase: "main",
    upperReads: 0,
    changeFinalTopology: false,
  };
  await serve((request, response) => {
    const path = request.path.split("?")[0];
    if (path === "/user") {
      response.statusCode = fixture.viewerStatus;
      for (const [name, value] of Object.entries(fixture.viewerHeaders))
        response.setHeader(name, value);
      fixture.viewerReads += 1;
      if (fixture.changeMembershipAfterInitialTopology && fixture.viewerReads === 1) {
        if (fixture.changeMembershipAfterInitialTopology === "identity")
          fixture.nativeStack!.number = 43;
        else fixture.nativeStack!.base.ref = "new-trunk";
      }
      if (fixture.changeMembershipAfterFinalTopology && fixture.viewerReads === 2)
        fixture.nativeStack!.pull_requests.reverse();
      response.end(
        fixture.viewerStatus === 200
          ? '{"login":"author"}'
          : JSON.stringify({ message: fixture.viewerMessage }),
      );
    } else if (path === `${prefix}/stacks`)
      response.end(JSON.stringify(fixture.nativeStack ? [fixture.nativeStack] : []));
    else if (path === `${prefix}/stacks/${fixture.nativeStack?.number}`)
      response.end(JSON.stringify(fixture.nativeStack));
    else if (path === `${prefix}/pulls/101`)
      response.end(
        JSON.stringify({
          ...pull,
          state: fixture.bottomState,
          merged: false,
          head: { ...pull.head, sha: fixture.lowerHeadSha },
          base: { ref: fixture.bottomBase, sha: "b".repeat(40) },
        }),
      );
    else if (path === `${prefix}/pulls/102`) {
      fixture.upperReads += 1;
      if (fixture.changeFinalTopology && fixture.upperReads === 5)
        fixture.upperHeadSha = "d".repeat(40);
      response.end(
        JSON.stringify({
          ...pull,
          id: 100002,
          node_id: "PR_102",
          number: 102,
          merged: false,
          head: { ...pull.head, ref: "user-api", sha: fixture.upperHeadSha },
          base: { ref: fixture.upperBaseName, sha: fixture.upperBaseSha },
        }),
      );
    } else if (path === prefix) {
      if (fixture.changeDuringValidation) fixture.upperHeadSha = "d".repeat(40);
      if (fixture.dropStackDuringValidation) fixture.nativeStack = null;
      response.end(
        '{"allow_merge_commit":true,"allow_squash_merge":true,"allow_rebase_merge":false}',
      );
    } else if (path?.endsWith("/protection")) response.end("{}");
    else if (path?.endsWith("check-runs")) response.end('{"total_count":0,"check_runs":[]}');
    else if (path?.endsWith("check-suites")) response.end('{"total_count":0,"check_suites":[]}');
    else if (path?.endsWith("actions/runs")) response.end('{"total_count":0,"workflow_runs":[]}');
    else if (path?.endsWith("/merge-async") && request.method === "PUT") {
      response.statusCode = 202;
      response.end(
        JSON.stringify({
          status: "pending",
          details: {
            uuid: "630b9d5e-3f2a-4f7e-8b0c-2d5f9a8c1e42",
            expected_head_sha: upperSha,
            merge_action: "direct_merge",
            merge_method: "squash",
            bypass_rules: false,
          },
        }),
      );
    } else response.end("[]");
  });
  return fixture;
}

export async function certify(prs: number[]) {
  await runWithGithubTransport("rest", async () => {
    for (const pr of prs) {
      const raw = await fetchRawSummaryPr(pr, repo);
      const fingerprint = fingerprintRawSummaryPr(raw);
      expect(fingerprint).not.toBeNull();
      await writeReadyReceipt({
        version: 1,
        owner: repo.owner,
        repo: repo.name,
        pr,
        headRefOid: raw.headRefOid,
        baseRefOid: raw.baseRefOid,
        status: "READY",
        isDraft: false,
        readinessFingerprint: fingerprint!,
        recordedAtUnix: Math.floor(Date.now() / 1000),
      });
    }
  });
}
export const apply = () =>
  runWithGithubTransport("rest", () =>
    runApplyMerge({
      prNumber: 102,
      targetRepository: repo,
      requireSha: upperSha,
      mergeAction: "direct_merge",
      mergeMethod: "squash",
    }),
  );
export const mutations = () => wire.requests.filter((request) => request.method !== "GET");
