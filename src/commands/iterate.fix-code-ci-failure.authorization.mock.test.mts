/* eslint-disable max-lines */
import { describe, expect, it } from "vitest";
import {
  makeOpts,
  makeReport,
  mockFetch,
  mockRunCheck,
  mockUpdateReadyDelay,
  registerIterateHooks,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";
import { makeThread } from "../../test-helpers/commands/iterate-thread-test-support.mts";
import type { ClassifiedCheck } from "../types.mts";

registerIterateHooks();

function failingCheck(overrides: Partial<ClassifiedCheck> = {}): ClassifiedCheck {
  return {
    name: "tests",
    status: "COMPLETED",
    conclusion: "FAILURE",
    detailsUrl: "https://github.com/owner/repo/actions/runs/123",
    event: "pull_request",
    runId: "123",
    runAttempt: 1,
    workflowName: "CI",
    category: "failing",
    ...overrides,
  };
}

function checkSet(
  failing: ClassifiedCheck[] = [failingCheck()],
  inProgress: ClassifiedCheck[] = [],
) {
  return {
    passing: [],
    failing,
    inProgress,
    skipped: [],
    filtered: [],
    filteredNames: [],
    blockedByFilteredCheck: false,
  };
}

function failingCheckReport(overrides: Partial<Parameters<typeof makeReport>[0]> = {}) {
  return makeReport({
    status: "FAILING",
    checks: checkSet(undefined, [
      {
        name: "lint",
        status: "IN_PROGRESS",
        conclusion: null,
        detailsUrl: "https://github.com/owner/repo/actions/runs/456",
        event: "pull_request",
        runId: "456",
        category: "in_progress",
      },
    ]),
    ...overrides,
  });
}

const readOnlyAuthorization = {
  repositoryPermission: "READ" as const,
  viewerCanAdminister: false,
  viewerDidAuthor: false,
  viewerCanUpdate: false,
  viewerCanEnableAutoMerge: false,
  viewerCanEditFiles: false,
  headRepositoryPermission: "READ" as const,
};

function prepareManualCheck(overrides: Partial<Parameters<typeof makeReport>[0]> = {}) {
  mockRunCheck.mockResolvedValue(
    failingCheckReport({ viewerAuthorization: readOnlyAuthorization, ...overrides }),
  );
  mockUpdateReadyDelay.mockResolvedValue({
    isReady: false,
    shouldCancel: false,
    remainingSeconds: 600,
  });
}

function expectCheckFollowUpUnavailable(result: Awaited<ReturnType<typeof runIterate>>) {
  expect(result).toMatchObject({
    action: "escalate",
    escalate: {
      triggers: expect.arrayContaining(["check-follow-up-unavailable"]),
    },
  });
}

describe("fix_code — GitHub Actions authorization", () => {
  it("never cancels or recommends cancelling workflow runs, regardless of repository role", async () => {
    // makeReport defaults to repositoryPermission: "ADMIN" — cancellation stays unrecommended
    // even for a fully-authorized viewer; only reruns are gated on repository role.
    mockRunCheck.mockResolvedValue(failingCheckReport());
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") return;
    expect(result.cancelled).toEqual([]);
    expect(result.fix.inProgressRunIds).toEqual([]);
    expect(result.fix.instructions.join("\n")).not.toContain("gh run cancel");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("recommends an authorized rerun when the viewer's repository role is WRITE+", async () => {
    mockRunCheck.mockResolvedValue(failingCheckReport());
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") return;
    expect(result.fix.checks[0]?.rerunCommand).toBe("gh run rerun 123 -R owner/repo");
    expect(result.fix.instructions.join("\n")).toContain("[rerun authorized]");
    expect(result.fix.instructions.join("\n")).not.toContain("no authorized follow-up action");
  });

  it("escalates instead of recommending a second rerun after attempt 1 was consumed", async () => {
    mockRunCheck.mockResolvedValue(
      failingCheckReport({ checks: checkSet([failingCheck({ runAttempt: 2 })]) }),
    );

    const result = await runIterate(makeOpts());

    expectCheckFollowUpUnavailable(result);
    if (result.action !== "escalate") return;
    expect(result.escalate.checks?.[0]).toMatchObject({ runAttempt: 2 });
    expect(result.escalate.checks?.[0]?.rerunCommand).toBeUndefined();
    expect(result.escalate.humanMessage).toContain("[attempt: 2]");
    expect(result.escalate.humanMessage).not.toContain("gh run rerun");
  });

  it("denies reruns conservatively when GitHub omits run-attempt metadata", async () => {
    const report = failingCheckReport();
    delete report.checks.failing[0]?.runAttempt;
    mockRunCheck.mockResolvedValue(report);

    const result = await runIterate(makeOpts());

    expectCheckFollowUpUnavailable(result);
    if (result.action !== "escalate") return;
    expect(result.escalate.checks?.[0]?.rerunCommand).toBeUndefined();
  });

  it("escalates when the viewer's repository role cannot authorize the only follow-up", async () => {
    prepareManualCheck();

    const result = await runIterate(makeOpts());

    expectCheckFollowUpUnavailable(result);
    if (result.action !== "escalate") return;
    expect(result.escalate.checks?.[0]?.rerunCommand).toBeUndefined();
  });

  it("preserves merge mode in the resume command for a manual check hand-off", async () => {
    prepareManualCheck();

    const result = await runIterate(makeOpts({ merge: true }));

    expectCheckFollowUpUnavailable(result);
    if (result.action !== "escalate") return;
    expect(result.escalate.humanMessage).toContain(
      "/pr-shepherd:pr-shepherd https://github.com/owner/repo/pull/42 --merge",
    );
  });

  it("does not let a surfaced approval postpone a manual-only check escalation", async () => {
    prepareManualCheck({
      approvedReviews: [
        {
          id: "approval-1",
          author: "reviewer",
          authorType: "User",
          body: "Looks good",
        },
      ],
    });

    const result = await runIterate(makeOpts());

    expectCheckFollowUpUnavailable(result);
    if (result.action !== "escalate") return;
    expect(result.escalate.checks?.[0]?.rerunCommand).toBeUndefined();
  });

  it("completes a pending comment minimization before escalating a manual-only check", async () => {
    prepareManualCheck({
      comments: { actionable: [], firstLook: [], minimizeIds: ["comment-to-minimize"] },
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") return;
    expect(result.fix.resolveCommand.argv).toContain("comment-to-minimize");
  });

  it("does not treat a stale human review as autonomous work", async () => {
    prepareManualCheck({
      changesRequestedReviews: [
        {
          id: "stale-human-review",
          author: "reviewer",
          authorType: "User",
          body: "Changes requested on an older commit",
          staleReview: true,
        },
      ],
    });

    const result = await runIterate(makeOpts());

    expectCheckFollowUpUnavailable(result);
    if (result.action !== "escalate") return;
    expect(result.escalate.changesRequestedReviews).toEqual([
      expect.objectContaining({ id: "stale-human-review" }),
    ]);
  });

  it("escalates when a runId has no confirmed GitHub Actions provenance or evidence", async () => {
    // An external CI system's details URL can coincidentally match the same /runs/<digits>/
    // pattern GitHub Actions details URLs use. Without a resolved workflowName (the same
    // GraphQL path that produces the run's numeric ID), Shepherd cannot confirm the parsed
    // runId actually names a GitHub Actions run, so it must not recommend rerunning it.
    prepareManualCheck({
      checks: checkSet([
        failingCheck({
          name: "external-ci",
          detailsUrl: "https://ci.example.com/runs/123",
          workflowName: undefined,
        }),
      ]),
    });

    const result = await runIterate(makeOpts());

    expectCheckFollowUpUnavailable(result);
    if (result.action !== "escalate") return;
    expect(result.escalate.checks?.[0]?.rerunCommand).toBeUndefined();
  });

  it("escalates an ACTION_REQUIRED check for manual workflow approval", async () => {
    // ACTION_REQUIRED means the run is paused pending manual workflow approval on GitHub;
    // a rerun cannot grant that approval, so no rerun command applies.
    prepareManualCheck({
      checks: checkSet([failingCheck({ conclusion: "ACTION_REQUIRED" })]),
    });

    const result = await runIterate(makeOpts());

    expectCheckFollowUpUnavailable(result);
    if (result.action !== "escalate") return;
    expect(result.escalate.checks?.[0]).toMatchObject({ conclusion: "ACTION_REQUIRED" });
    expect(result.escalate.checks?.[0]?.rerunCommand).toBeUndefined();
  });

  it("waits when a sibling job prevents rerunning the only failing run", async () => {
    // GitHub can only rerun a workflow run once it has fully completed.
    prepareManualCheck({
      checks: checkSet(undefined, [
        {
          name: "lint",
          status: "IN_PROGRESS",
          conclusion: null,
          detailsUrl: "https://github.com/owner/repo/actions/runs/123",
          event: "pull_request",
          runId: "123",
          category: "in_progress",
        },
      ]),
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") return;
    expect(result.fix.checks[0]?.rerunCommand).toBeUndefined();
  });

  it("surfaces a denied suppressed auto-resolve thread once without escalating", async () => {
    const thread = makeThread({
      id: "thread-denied",
      author: "review-bot",
      authorType: "Bot",
      viewerCanReply: false,
      viewerCanResolve: false,
    });
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: {
          actionable: [thread],
          resolutionOnly: [],
          autoResolved: [],
          autoResolveErrors: [],
          firstLook: [],
          ruleAutoResolveIds: [thread.id],
        },
      }),
    );

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") return;
    expect(result.fix.threads).toEqual([expect.objectContaining({ id: thread.id })]);
    expect(result.fix.resolveCommand.hasMutations).toBe(false);
  });

  it("surfaces denied reply and dismissal items without escalating or mutating", async () => {
    const thread = makeThread({
      id: "thread-human",
      author: "alice",
      authorType: "User",
      viewerCanReply: false,
      viewerCanResolve: false,
    });
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        viewerAuthorization: {
          repositoryPermission: "WRITE",
          viewerCanAdminister: false,
          viewerDidAuthor: true,
          viewerCanUpdate: true,
          viewerCanEnableAutoMerge: true,
          viewerCanEditFiles: true,
          headRepositoryPermission: "WRITE",
        },
        threads: {
          actionable: [thread],
          resolutionOnly: [],
          autoResolved: [],
          autoResolveErrors: [],
          firstLook: [],
        },
        changesRequestedReviews: [
          { id: "review-bot", author: "review-bot", authorType: "Bot", body: "fix" },
        ],
      }),
    );

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") return;
    expect(result.fix.threads).toEqual([expect.objectContaining({ id: thread.id })]);
    expect(result.fix.changesRequestedReviews).toEqual([
      expect.objectContaining({ id: "review-bot" }),
    ]);
    expect(result.fix.resolveCommand.hasMutations).toBe(false);
  });

  it("skips a paired viewer-authored mutation when resolve authorization is denied", async () => {
    const thread = makeThread({
      id: "thread-viewer",
      author: "viewer",
      authorType: "User",
      viewerDidAuthor: true,
      viewerCanReply: true,
      viewerCanResolve: false,
    });
    mockRunCheck.mockResolvedValue(
      makeReport({
        status: "UNRESOLVED_COMMENTS",
        threads: {
          actionable: [thread],
          resolutionOnly: [],
          autoResolved: [],
          autoResolveErrors: [],
          firstLook: [],
        },
      }),
    );

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    if (result.action !== "fix_code") return;
    expect(result.fix.resolveCommand.hasMutations).toBe(false);
  });
});
