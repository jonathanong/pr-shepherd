import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeCheckBlocker } from "../state/check-blockers.mts";
import { GitHubRequestError } from "./errors.mts";

const { mockGraphql, mockLoadConfig } = vi.hoisted(() => ({
  mockGraphql: vi.fn(),
  mockLoadConfig: vi.fn(),
}));
vi.mock("./client.mts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client.mts")>()),
  graphql: mockGraphql,
}));
vi.mock("../config/load.mts", () => ({ loadConfig: mockLoadConfig }));
vi.mock("../state/seen-comments.mts", () => ({
  loadSeenMap: vi.fn().mockResolvedValue(new Map()),
}));

import { applyOpenCheckBlockers } from "./poll-summary-check-blockers.mts";
import { summarizePollSummaryPr } from "./poll-summary-projector.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

const repo = { owner: "acme", name: "widgets" };
const routed = { action: "fix_code" as const, reasons: ["failing-checks"] };
const pull = { owner: "acme", name: "widgets", number: 9, kind: "pull" as const };
let stateDir = "";

function raw(names: string[] = ["backend-tests (1)"]): RawSummaryPr {
  const nodes = names.map((check) => ({
    __typename: "CheckRun" as const,
    name: check,
    status: "COMPLETED",
    conclusion: "FAILURE",
    checkSuite: { workflowRun: { event: "pull_request" } },
  }));
  return {
    number: 42,
    title: "Widgets",
    url: "https://github.com/acme/widgets/pull/42",
    state: "OPEN",
    isDraft: false,
    viewerCanUpdate: true,
    headRefName: "widgets",
    headRefOid: "a".repeat(40),
    baseRefName: "main",
    baseRefOid: "b".repeat(40),
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: null,
    isInMergeQueue: false,
    mergeQueueEntry: null,
    stack: { number: 9, size: 1, baseRefName: "main" },
    stackEntry: { position: 1 },
    comments: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    reviews: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    reviewThreads: { totalCount: 0, pageInfo: { hasPreviousPage: false }, nodes: [] },
    commits: {
      nodes: [
        {
          commit: {
            oid: "e".repeat(40),
            statusCheckRollup: nodes.length
              ? {
                  contexts: {
                    totalCount: nodes.length,
                    pageInfo: { hasPreviousPage: false },
                    nodes,
                  },
                }
              : null,
          },
        },
      ],
    },
  } as unknown as RawSummaryPr;
}

beforeEach(async () => {
  stateDir = await mkdtemp(join(tmpdir(), "pr-shepherd-summary-blocker-"));
  process.env["PR_SHEPHERD_STATE_DIR"] = stateDir;
  mockGraphql.mockReset();
  mockLoadConfig.mockReturnValue({
    cliCommand: ["pr-shepherd"],
    botUsernames: [],
    ignoreChecks: [],
    checks: { ciTriggerEvents: ["pull_request"] },
    actions: { autoMarkReady: true, workWhileQueued: false, neverCancelRuns: [] },
    watch: { readyDelayMinutes: 10 },
    mergeStatus: { blockingReviewerLogins: [] },
  });
});

afterEach(async () => {
  delete process.env["PR_SHEPHERD_STATE_DIR"];
  await rm(stateDir, { recursive: true, force: true });
});

describe("applyOpenCheckBlockers", () => {
  it("leaves unrelated routes and incomplete or mixed failures alone", async () => {
    expect(
      await applyOpenCheckBlockers(
        raw(),
        repo,
        { action: "wait", reasons: ["pending-or-unknown"] },
        {},
        {},
        true,
      ),
    ).toMatchObject({ action: "wait" });
    expect(
      await applyOpenCheckBlockers(raw(), repo, routed, { failing: 1, incomplete: true }, {}, true),
    ).toBe(routed);
    expect(
      await applyOpenCheckBlockers(raw(), repo, routed, { failing: 1 }, { actionable: 1 }, true),
    ).toEqual(routed);
    expect(await applyOpenCheckBlockers(raw([]), repo, routed, { failing: 1 }, {}, true)).toEqual(
      routed,
    );
    expect(mockGraphql).not.toHaveBeenCalled();
  });

  it("waits only when every failing check is deferred", async () => {
    await writeCheckBlocker(
      { owner: "acme", repo: "widgets", pr: 42 },
      { checkName: "backend-tests (1)", blocker: pull, recordedAt: 1 },
    );
    mockGraphql.mockResolvedValue({
      data: { repository: { pullRequest: { state: "OPEN", merged: false } } },
    });
    const single = await applyOpenCheckBlockers(raw(), repo, routed, { failing: 1 }, {}, false);
    expect(single).toEqual({ action: "wait", reasons: ["blocked-by:acme/widgets#9"] });
    expect(single.pollProbe).toBeUndefined();
    const mixed = await applyOpenCheckBlockers(
      raw(["backend-tests (1)", "lint"]),
      repo,
      routed,
      { failing: 2 },
      {},
      true,
    );
    expect(mixed.action).toBe("fix_code");
    const item = await summarizePollSummaryPr(raw(), repo, { stackPrNumber: 42 });
    expect(item).toMatchObject({
      action: "wait",
      reasons: ["blocked-by:acme/widgets#9"],
      pollProbe: true,
    });
  });

  it("propagates a blocker lookup rate limit", async () => {
    await writeCheckBlocker(
      { owner: "acme", repo: "widgets", pr: 42 },
      { checkName: "backend-tests (1)", blocker: pull, recordedAt: 1 },
    );
    const err = new GitHubRequestError("API rate limit exceeded", { status: 429 });
    mockGraphql.mockRejectedValue(err);
    await expect(
      applyOpenCheckBlockers(raw(), repo, routed, { failing: 1 }, {}, true),
    ).rejects.toBe(err);
  });
});
