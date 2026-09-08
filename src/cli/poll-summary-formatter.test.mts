import { describe, expect, it } from "vitest";

import type { PollSummaryItem, PollSummaryResult } from "../types.mts";
import { formatPollSummaryResult } from "./poll-summary-formatter.mts";

function row(overrides: Partial<PollSummaryItem> = {}): PollSummaryItem {
  return {
    pr: 42,
    repo: "acme/widgets",
    title: "Widgets",
    url: "https://github.com/acme/widgets/pull/42",
    action: "cancel",
    reasons: ["merged"],
    state: "MERGED",
    mergeable: "UNKNOWN",
    mergeStateStatus: "UNKNOWN",
    headRefName: "widgets",
    headRefOid: "a".repeat(40),
    baseRefName: "main",
    ...overrides,
  };
}

function result(item: PollSummaryItem, reason: PollSummaryResult["reason"]): PollSummaryResult {
  return {
    mode: "summary",
    repo: "acme/widgets",
    selection: { kind: "prs", requested: [item.pr] },
    reason,
    prs: [item],
  };
}

describe("formatPollSummaryResult", () => {
  it("omits trivial counters and non-actionable poll commands", () => {
    const text = formatPollSummaryResult(result(row(), "all_terminal"));

    expect(text).not.toContain("checks:");
    expect(text).not.toContain("review:");
    expect(text).not.toContain("pollCommand:");
    expect(text).toContain("1. Stop — every selected PR is terminal.");
  });

  it("renders actionable raw counts and the exact one-PR command", () => {
    const text = formatPollSummaryResult(
      result(
        row({
          action: "fix_code",
          reasons: ["failing-checks"],
          state: "OPEN",
          mergeable: "MERGEABLE",
          mergeStateStatus: "UNSTABLE",
          checks: { passing: 1, failing: 2 },
          review: { comments: 1 },
          pollCommand: "npx pr-shepherd https://github.com/acme/widgets/pull/42 --until-terminal",
        }),
        "actionable",
      ),
    );

    expect(text).toContain("checks: 1 passing, 2 failing");
    expect(text).toContain("review: 1 comment");
    expect(text).toContain("pollCommand: `npx pr-shepherd");
  });

  it("renders aggregate quota warning guidance", () => {
    const text = formatPollSummaryResult({
      ...result(row({ action: "wait", reasons: ["pending-or-unknown"] }), "waiting"),
      quotaWarning: {
        resource: "graphql",
        thresholdPercent: 20,
        remaining: 900,
        limit: 5_000,
        resetAt: 2_000_000_000,
        pollIntervalMinutes: 5,
        pollTimeoutMinutes: 15,
      },
    });
    expect(text).toContain("## GitHub API quota warning");
    expect(text).toContain("This aggregate selection is non-terminal");
    expect(text).toContain("--interval 5m");
  });

  it("retains actionable row instructions when a quota warning is present", () => {
    const text = formatPollSummaryResult({
      ...result(row({ action: "fix_code", reasons: ["failing-checks"] }), "actionable"),
      quotaWarning: {
        resource: "graphql",
        thresholdPercent: 20,
        remaining: 900,
        limit: 5_000,
        resetAt: 2_000_000_000,
        pollIntervalMinutes: 5,
        pollTimeoutMinutes: 15,
      },
    });
    expect(text).toContain("Choose each non-WAIT, non-CANCEL row");
    expect(text).toContain("3. After selected work completes");
  });

  it("tells one-shot and timed-out callers to recheck", () => {
    expect(formatPollSummaryResult(result(row({ action: "wait" }), "waiting"))).toContain(
      "Run this aggregate selector again",
    );
    expect(formatPollSummaryResult(result(row({ action: "wait" }), "timeout"))).toContain(
      "Run this aggregate selector again",
    );
  });
});
