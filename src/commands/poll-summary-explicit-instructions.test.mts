import { describe, expect, it } from "vitest";
import type { PollSummaryItem, PollSummaryResult } from "../types.mts";
import { explicitInstructions } from "./poll-summary-explicit-instructions.mts";

const quotaWarning = {
  resource: "graphql",
  thresholdPercent: 20,
  remaining: 900,
  limit: 5_000,
  resetAt: 2_000_000_000,
  pollIntervalMinutes: 5,
  pollTimeoutMinutes: 15,
} as const;

function result(reason: PollSummaryResult["reason"], action: PollSummaryItem["action"]) {
  return {
    mode: "summary",
    repo: "acme/widgets",
    selection: { kind: "prs", requested: [42] },
    reason,
    quotaWarning,
    prs: [{ pr: 42, action, reasons: [] }],
  } as unknown as PollSummaryResult;
}

describe("explicitInstructions quota continuations", () => {
  const command = "pr-shepherd https://github.com/o/r/pull/42 --until-terminal";

  it.each([
    ["waiting", "wait"],
    ["timeout", "wait"],
    ["actionable", "triage"],
  ] as const)("keeps the literal command for a %s selection", (reason, action) => {
    const text = explicitInstructions(result(reason, action), command).join("\n");
    expect(text.toLowerCase()).toContain(`run \`${command}\` again at the cadence below`);
    expect(text).toContain("Do not end the turn while any selected row is non-terminal");
    expect(text).toContain("--interval 5m");
  });

  it("names the aggregate command generically without a caller command", () => {
    expect(explicitInstructions(result("waiting", "wait")).join("\n")).toContain(
      "Run this aggregate command again at the cadence below",
    );
  });
});
