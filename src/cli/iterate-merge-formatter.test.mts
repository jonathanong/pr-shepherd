import { describe, expect, it } from "vitest";
import type { IterateResult, IterateResultMerge } from "../types.mts";
import {
  makeCancelResult,
  makeFixCodeResult,
  makeWaitResult,
} from "../../test-helpers/commands/poll.test-support.mts";
import { formatFixCodeResult } from "./fix-formatter.mts";
import { formatIterateResult } from "./iterate-formatter.mts";
import { projectIterateLean } from "./iterate-lean.mts";
import { appendMergeQueueHeader, formatMergeAction } from "./iterate-merge-formatter.mts";

function mergeResult(mode: "auto" | "queue"): IterateResultMerge {
  return {
    action: "merge",
    pr: 42,
    repo: "owner/repo",
    status: "READY",
    state: "OPEN",
    mergeStateStatus: "CLEAN",
    mergeStatus: "CLEAN",
    reviewDecision: "APPROVED",
    blockingBotReviewInProgress: false,
    isDraft: false,
    shouldCancel: true,
    remainingSeconds: 0,
    summary: { passing: 1, skipped: 0, filtered: 0, inProgress: 0, superseded: 0 },
    baseBranch: "main",
    branchProtection: null,
    checks: [],
    merge: {
      mode,
      command: { argv: ["gh", "pr", "merge", "42"] },
      ...(mode === "auto" && {
        fallbackCommand: { argv: ["gh", "pr", "merge", "42", "--merge"] },
      }),
      ...(mode === "queue" && {
        queueApiFallbackCommand: { argv: ["gh", "api", "graphql", "-f", "query=mutation"] },
      }),
    },
  };
}

describe("iterate merge formatting", () => {
  it("omits a queue header when no queue state exists", () => {
    const lines: string[] = [];
    appendMergeQueueHeader(lines, mergeResult("auto"));
    expect(lines).toEqual([]);
  });

  it("renders all raw queue, auto-merge, and removal fields", () => {
    const lines: string[] = [];
    const result = {
      ...mergeResult("queue"),
      mergeQueue: {
        enabled: true,
        inQueue: true,
        entry: {
          state: "AWAITING_CHECKS",
          position: 2,
          estimatedTimeToMerge: 90,
          enqueuedAtUnix: 100,
          enqueuer: "octocat",
          headCommitOid: "queue-head",
        },
        checkCommitOid: "queue-head",
        checksIncomplete: true,
        headUpdatedAfterRemoval: true,
        autoMergeRequest: { mergeMethod: "SQUASH", enabledAtUnix: 101, enabledBy: "hubot" },
        latestRemoval: {
          reason: null,
          createdAtUnix: 102,
          actor: "github-merge-queue",
          beforeCommitOid: "removed-head",
          beforeCommitParentOids: ["base", "pr-head"],
        },
      },
    } as IterateResult;

    appendMergeQueueHeader(lines, result);
    expect(lines.join("\n")).toContain("estimatedTimeToMerge `90`");
    expect(lines.join("\n")).toContain("enqueuer `@octocat`");
    expect(lines.join("\n")).toContain("checks incomplete");
    expect(lines.join("\n")).toContain("method `SQUASH`");
    expect(lines.join("\n")).toContain("reason `not provided`");
    expect(lines.join("\n")).toContain("parents `base,pr-head`");
  });

  it("renders ordinary and queue merge commands with their fallback instructions", () => {
    const ordinary = formatMergeAction("header", mergeResult("auto"));
    expect(ordinary).toContain("plain merge fallback");
    expect(ordinary).toContain("Only if GitHub reports that auto-merge is unavailable");

    const queue = formatMergeAction("header", mergeResult("queue"));
    expect(queue).toContain("queue API fallback");
    expect(queue).toContain("If the gh CLI says auto-merge is disabled");
    expect(queue).toContain("Then iterate immediately");

    expect(formatIterateResult(mergeResult("queue"))).toContain("## Merge command");
    expect(projectIterateLean(mergeResult("queue"))).toMatchObject({
      merge: { mode: "queue" },
    });
  });

  it("keeps backticks in configured arguments inside one Markdown code span", () => {
    const result = mergeResult("auto");
    result.merge.command.argv.push("--subject", "release `v1`");
    if (!result.merge.fallbackCommand) throw new Error("expected fallback command");
    result.merge.fallbackCommand.argv.push("--subject", "release `v1`");

    const output = formatMergeAction("header", result);
    expect(output).toContain("``gh pr merge 42 --subject 'release `v1`'``");
    expect(output).toContain("command: ``gh pr merge 42 --merge --subject 'release `v1`'``.");
  });

  it("renders the deferred-work line on a wait result while queued", () => {
    const result = {
      ...makeWaitResult({
        deferredWork: { threads: 1, comments: 2, changesRequestedReviews: 1, reviewSummaries: 2 },
      } as Partial<IterateResult>),
      mergeQueue: { enabled: true, inQueue: true },
    } as IterateResult;

    const output = formatIterateResult(result);
    expect(output).toContain(
      "**deferred (in merge queue)** 1 thread, 2 comments, 1 changes-requested review, 2 review summaries",
    );
  });

  it("omits the deferred-work line on a wait result with no deferred work", () => {
    const result = {
      ...makeWaitResult(),
      mergeQueue: { enabled: true, inQueue: true },
    } as IterateResult;

    expect(formatIterateResult(result)).not.toContain("**deferred");
  });

  it("includes the merge-queue header on a cancel result (output-format parity with JSON)", () => {
    const result = {
      ...makeCancelResult(),
      state: "OPEN",
      reason: "ready-delay-elapsed",
      mergeQueue: { enabled: true, inQueue: true },
    } as IterateResult;

    const output = formatIterateResult(result);
    expect(output).toContain("**merge queue** enabled `true` · inQueue `true`");
    expect(projectIterateLean(result)).toMatchObject({ mergeQueue: { inQueue: true } });
  });

  it("renders post-fix requeue commands", () => {
    const result = makeFixCodeResult();
    if (result.action !== "fix_code") throw new Error("expected fix_code fixture");
    result.fix.requeue = {
      mode: "queue",
      command: { argv: ["gh", "pr", "merge", "42"] },
      queueApiFallbackCommand: { argv: ["gh", "api", "graphql"] },
    };
    const output = formatFixCodeResult("header", result);
    expect(output).toContain("- requeue: `gh pr merge 42`");
    expect(output).toContain("- requeue API fallback: `gh api graphql`");
  });
});
