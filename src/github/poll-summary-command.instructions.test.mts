import { describe, expect, it } from "vitest";
import type { PollSummarySelection } from "../types.mts";
import { aggregateRerunCommand, pollCommandFields } from "./poll-summary-command.mts";

describe("pollCommandFields --instructions", () => {
  it("forwards an explicit instruction style to the per-PR poll command", () => {
    expect(pollCommandFields("o/r", 7, false, { instructions: "playbook" }).pollCommand).toContain(
      "--instructions playbook",
    );
    expect(pollCommandFields("o/r", 7, false, { instructions: "inline" }).pollCommand).toContain(
      "--instructions inline",
    );
  });

  it("omits the flag when no style was requested", () => {
    expect(pollCommandFields("o/r", 7, false, {}).pollCommand).not.toContain("--instructions");
  });
});

describe("pollCommandFields single ticks", () => {
  it("routes each PR to one iterate tick instead of a sleeping poll", () => {
    const fields = pollCommandFields("o/r", 7, false, { tick: true, readyDelaySeconds: 60 });
    expect(fields).toEqual({
      pollCommand: "pr-shepherd iterate https://github.com/o/r/pull/7 --ready-delay 60s",
    });
  });

  it("keeps a bounded draft probe as one iterate tick without loop flags", () => {
    expect(pollCommandFields("o/r", 7, true, { tick: true, noAutoMarkReady: true })).toEqual({
      pollCommand: "pr-shepherd iterate https://github.com/o/r/pull/7 --no-auto-mark-ready",
      pollProbe: true,
    });
  });
});

describe("aggregateRerunCommand", () => {
  const prs: PollSummarySelection = { kind: "prs", requested: [7, 8] };
  const stack: PollSummarySelection = { kind: "stack", anchor: 7, stackNumber: 1, stackSize: 2 };

  it("prints every selected PR as a URL with --until-terminal", () => {
    expect(aggregateRerunCommand("o/r", prs, {})).toBe(
      "pr-shepherd https://github.com/o/r/pull/7 https://github.com/o/r/pull/8 --until-terminal",
    );
  });

  it("forwards the caller's selection options", () => {
    expect(
      aggregateRerunCommand("o/r", prs, {
        merge: true,
        readyDelaySeconds: 60,
        stallTimeoutSeconds: 120,
        instructions: "playbook",
        noAutoMarkReady: true,
      }),
    ).toBe(
      "pr-shepherd https://github.com/o/r/pull/7 https://github.com/o/r/pull/8 --until-terminal --merge --ready-delay 60s --stall-timeout 120s --instructions playbook --no-auto-mark-ready",
    );
  });

  it("prints the stack subcommand, as one tick for a single-tick run", () => {
    expect(aggregateRerunCommand("o/r", stack, {})).toBe(
      "pr-shepherd stack https://github.com/o/r/pull/7 --until-terminal",
    );
    expect(aggregateRerunCommand("o/r", stack, { tick: true })).toBe(
      "pr-shepherd stack https://github.com/o/r/pull/7 --once",
    );
  });
});
