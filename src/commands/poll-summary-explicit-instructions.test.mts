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

describe("explicitInstructions stack receipt note", () => {
  const terminal = (prs: Partial<PollSummaryItem>[]) =>
    ({
      mode: "summary",
      repo: "acme/widgets",
      selection: { kind: "prs", requested: prs.map((item) => item.pr) },
      reason: "all_terminal",
      prs,
    }) as unknown as PollSummaryResult;
  const layer = (pr: number, state: PollSummaryItem["state"] = "OPEN") => ({
    pr,
    state,
    action: "cancel" as const,
    reasons: ["appears-ready"],
    stack: { number: 7, size: 2, position: 1, baseRefName: "main" },
  });

  it("says a multi-PR poll records no receipt for stack layers that look ready", () => {
    const [, note] = explicitInstructions(terminal([layer(41), layer(42)]));
    expect(note).toBe(
      "2. #41, #42 are native stack layers: this poll does not record the READY receipt a stack merge needs. If the user asked to merge, run `pr-shepherd stack` with `--merge` instead; it starts the one-PR sessions that record them.",
    );
    expect(explicitInstructions(terminal([layer(41)]))[1]).toContain(
      "#41 is a native stack layer:",
    );
  });

  it("adds nothing for plain PRs or merged layers", () => {
    const plain = {
      pr: 9,
      state: "OPEN" as const,
      action: "cancel" as const,
      reasons: ["appears-ready"],
    };
    expect(explicitInstructions(terminal([plain, layer(41, "MERGED")]))).toEqual([
      "1. Stop — every selected PR is terminal.",
    ]);
  });
});

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
    expect(text).toContain("If a background exit wakes you, end the turn");
    expect(text).toContain("--interval 5m");
  });

  it("names the aggregate command generically without a caller command", () => {
    expect(explicitInstructions(result("waiting", "wait")).join("\n")).toContain(
      "Run this aggregate command again at the cadence below",
    );
  });
});
