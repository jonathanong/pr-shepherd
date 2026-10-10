import { describe, expect, it } from "vitest";
import {
  wire,
  serve,
  pull,
  repo,
  prefix,
} from "../../test-helpers/github/rest-read.test-support.mts";
import { runWithGithubTransport } from "../github/transport.mts";
import { fetchRawSummaryPr } from "../github/poll-summary.mts";
import { fingerprintRawSummaryPr } from "../github/poll-summary-fingerprint.mts";
import { writeReadyReceipt } from "../state/ready-receipts.mts";
import { runApplyMerge } from "./apply-merge.mts";

const lowerSha = "a".repeat(40);
const upperSha = "c".repeat(40);
const stack = {
  number: 42,
  node_id: "STACK_42",
  base: { ref: "main" },
  pull_requests: [{ number: 101 }, { number: 102 }],
};

async function stackedServer() {
  const fixture = { upperBaseSha: lowerSha, upperHeadSha: upperSha, changeDuringValidation: false };
  await serve((request, response) => {
    const path = request.path.split("?")[0];
    if (path === `${prefix}/stacks`) response.end(JSON.stringify([stack]));
    else if (path === `${prefix}/stacks/42`) response.end(JSON.stringify(stack));
    else if (path === `${prefix}/pulls/101`)
      response.end(
        JSON.stringify({
          ...pull,
          merged: false,
          head: { ...pull.head, sha: lowerSha },
          base: { ref: "main", sha: "b".repeat(40) },
        }),
      );
    else if (path === `${prefix}/pulls/102`)
      response.end(
        JSON.stringify({
          ...pull,
          id: 100002,
          node_id: "PR_102",
          number: 102,
          merged: false,
          head: { ...pull.head, ref: "user-api", sha: fixture.upperHeadSha },
          base: { ref: "user-model", sha: fixture.upperBaseSha },
        }),
      );
    else if (path === prefix) {
      if (fixture.changeDuringValidation) fixture.upperHeadSha = "d".repeat(40);
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

async function certify(prs: number[]) {
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
const apply = () =>
  runWithGithubTransport("rest", () =>
    runApplyMerge({
      prNumber: 102,
      targetRepository: repo,
      requireSha: upperSha,
      mergeAction: "direct_merge",
      mergeMethod: "squash",
    }),
  );
const mutations = () => wire.requests.filter((request) => request.method !== "GET");

describe("REST native-stack merge readiness at the HTTP boundary", () => {
  it("admits the current complete prefix with receipts bound to real REST summary evidence", async () => {
    await stackedServer();
    await certify([101, 102]);
    await expect(apply()).resolves.toMatchObject({ status: "pending" });
    expect(mutations()).toHaveLength(1);
    expect(mutations()[0]?.body).toMatchObject({ sha: upperSha, bypass_rules: false });
    expect(wire.requests.some((request) => request.path === "/graphql")).toBe(false);
  });

  it("rejects a missing lower-layer READY receipt before any mutation", async () => {
    await stackedServer();
    await certify([102]);
    await expect(apply()).rejects.toThrow("READY receipt");
    expect(mutations()).toHaveLength(0);
  });

  it("rejects a stale parent boundary before any mutation", async () => {
    const fixture = await stackedServer();
    await certify([101, 102]);
    fixture.upperBaseSha = "e".repeat(40);
    await expect(apply()).rejects.toThrow("stale parent boundaries");
    expect(mutations()).toHaveLength(0);
  });

  it("rejects a head changed while revalidating receipt evidence before any mutation", async () => {
    const fixture = await stackedServer();
    await certify([101, 102]);
    fixture.changeDuringValidation = true;
    await expect(apply()).rejects.toThrow();
    expect(mutations()).toHaveLength(0);
    expect(wire.requests.some((request) => request.path === "/graphql")).toBe(false);
  });
});
