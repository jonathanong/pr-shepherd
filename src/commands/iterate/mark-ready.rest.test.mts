import { describe, expect, it, vi } from "vitest";
import { wire, serve, repo } from "../../../test-helpers/github/rest-read.test-support.mts";
import type { IterateResultBase, ShepherdReport } from "../../types.mts";
import { runWithGithubTransport } from "../../github/transport.mts";
import { markReadyIfAuthorized } from "./mark-ready.mts";

const report: ShepherdReport = {
  transport: "rest",
  pr: 101,
  nodeId: "PR_101",
  repo: `${repo.owner}/${repo.name}`,
  status: "READY",
  baseBranch: "main",
  mergeStatus: {
    status: "CLEAN",
    state: "OPEN",
    isDraft: true,
    mergeable: "MERGEABLE",
    reviewDecision: null,
    blockingBotReviewInProgress: false,
    mergeStateStatus: "CLEAN",
  },
  checks: {
    passing: [],
    failing: [],
    inProgress: [],
    skipped: [],
    filtered: [],
    filteredNames: [],
    blockedByFilteredCheck: false,
  },
  threads: {
    actionable: [],
    resolutionOnly: [],
    autoResolved: [],
    autoResolveErrors: [],
    firstLook: [],
  },
  comments: { actionable: [], firstLook: [] },
  changesRequestedReviews: [],
  reviewSummaries: [],
  firstLookSummaries: [],
  editedSummaries: [],
  approvedReviews: [],
  branchProtection: null,
};
const base: IterateResultBase = {
  transport: "rest",
  pr: 101,
  repo: report.repo,
  status: "READY",
  state: "OPEN",
  mergeStateStatus: "CLEAN",
  mergeStatus: "CLEAN",
  reviewDecision: null,
  blockingBotReviewInProgress: false,
  isDraft: true,
  shouldCancel: false,
  remainingSeconds: 0,
  summary: { passing: 0, skipped: 0, filtered: 0, inProgress: 0, superseded: 0 },
  baseBranch: "main",
  branchProtection: null,
  checks: [],
};
const markReady = (value = report) =>
  runWithGithubTransport("rest", () => markReadyIfAuthorized(true, base, value));
describe("REST mark-ready authorization", () => {
  it("attempts cloud ready-for-review with unknown capability and trusts draft:false", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    await serve((_request, response) => response.end('{"draft":false}'));
    expect(await markReady()).toMatchObject({ action: "mark_ready", markedReady: true });
    expect(wire.requests).toMatchObject([
      { method: "POST", path: "/repos/octocat/hello-world/pulls/101/ccr/ready_for_review" },
    ]);
  });
  it("escalates a definite server403 once as authorization-required", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    await serve((_request, response) => {
      response.statusCode = 403;
      response.end('{"message":"Resource not accessible by integration"}');
    });
    expect(await markReady()).toMatchObject({
      action: "escalate",
      escalate: { triggers: ["authorization-required"] },
    });
    expect(wire.requests).toHaveLength(1);
  });
  it("escalates standard REST without fabricating cloud capability", async () => {
    await serve((_request, response) => response.end("{}"));
    expect(await markReady()).toMatchObject({
      action: "escalate",
      escalate: { triggers: ["transport-unsupported"] },
    });
    expect(wire.requests).toEqual([]);
  });
  it("does not mark a reused READY snapshot and propagates malformed acknowledgement", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    await serve((_request, response) => response.end('{"draft":true}'));
    expect(await markReady({ ...report, fingerprintReused: true })).toMatchObject({
      action: "mark_ready",
      markedReady: false,
    });
    expect(wire.requests).toEqual([]);
    await expect(markReady()).rejects.toThrow("did not confirm draft:false");
    expect(wire.requests).toHaveLength(1);
  });
});
