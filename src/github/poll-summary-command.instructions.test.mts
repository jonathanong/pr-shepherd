import { describe, expect, it } from "vitest";
import { loadConfig } from "../config/load.mts";
import type { PollSummarySelection } from "../types.mts";
import {
  aggregateRerunCommand,
  mergeReadyCommand,
  stackApprovalCommands,
  pollCommandFields,
} from "./poll-summary-command.mts";

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

  it("omits ready-delay and stall-timeout values equal to the configured defaults", () => {
    const iterate = loadConfig().iterate;
    expect(
      aggregateRerunCommand("o/r", prs, {
        readyDelaySeconds: iterate["ready-delay-minutes"] * 60,
        stallTimeoutSeconds: iterate["stall-timeout-minutes"] * 60,
      }),
    ).not.toMatch(/--ready-delay|--stall-timeout/);
  });

  it("keeps an explicit selection a single tick with the iterate subcommand", () => {
    expect(aggregateRerunCommand("o/r", prs, { tick: true })).toBe(
      "pr-shepherd iterate https://github.com/o/r/pull/7 https://github.com/o/r/pull/8",
    );
  });

  it("prints the stack subcommand, as one tick for a single-tick run", () => {
    expect(aggregateRerunCommand("o/r", stack, {})).toBe(
      'pr-shepherd stack "o/r#1" --until-terminal',
    );
    expect(aggregateRerunCommand("o/r", stack, { tick: true })).toBe(
      'pr-shepherd stack "o/r#1" --once',
    );
  });

  it("lists the caller's PRs after stack, not the anchor, when only some were declared", () => {
    const owned: PollSummarySelection = { ...stack, owned: [7, 9] };
    expect(aggregateRerunCommand("o/r", owned, { merge: true })).toBe(
      "pr-shepherd stack https://github.com/o/r/pull/7 https://github.com/o/r/pull/9 --until-terminal --merge",
    );
  });

  it("repeats the merge scope the caller chose", () => {
    expect(
      aggregateRerunCommand("o/r", stack, { merge: true, stackMerge: { kind: "ready" } }),
    ).toBe('pr-shepherd stack "o/r#1" --until-terminal --merge-ready');
    expect(
      aggregateRerunCommand("o/r", stack, { merge: true, stackMerge: { kind: "through", pr: 8 } }),
    ).toBe(
      'pr-shepherd stack "o/r#1" --until-terminal --merge-through https://github.com/o/r/pull/8',
    );
    expect(aggregateRerunCommand("o/r", stack, { merge: true, stackMerge: { kind: "all" } })).toBe(
      'pr-shepherd stack "o/r#1" --until-terminal --merge',
    );
  });

  it("builds the commands that approve unlisted layers: list them, or name the stack number", () => {
    const owned: PollSummarySelection = { ...stack, owned: [9] };
    expect(stackApprovalCommands("o/r", owned, { merge: true }, [7, 8])).toEqual({
      listed:
        "pr-shepherd stack https://github.com/o/r/pull/7 https://github.com/o/r/pull/8 https://github.com/o/r/pull/9 --until-terminal --merge",
      whole: 'pr-shepherd stack "o/r#1" --until-terminal --merge',
    });
    expect(stackApprovalCommands("o/r", prs, {}, [1])).toEqual({ listed: "", whole: "" });
  });
});

describe("mergeReadyCommand", () => {
  it.each([
    ["pr-shepherd stack https://github.com/o/r/pull/7 --until-terminal --merge", "--merge-ready"],
    [
      "pr-shepherd stack https://github.com/o/r/pull/7 --until-terminal --merge-through https://github.com/o/r/pull/8 --ready-delay 60s",
      "--merge-ready --ready-delay 60s",
    ],
  ])("swaps the whole-scope flag in %s", (command, tail) => {
    expect(mergeReadyCommand(command)).toBe(
      `pr-shepherd stack https://github.com/o/r/pull/7 --until-terminal ${tail}`,
    );
  });

  it("replaces the listed refs with the scoped PRs", () => {
    expect(
      mergeReadyCommand('npx pr-shepherd stack "o/r#9" --once --merge-through o/r#2 --x', [
        "https://github.com/o/r/pull/1",
        "https://github.com/o/r/pull/2",
      ]),
    ).toBe(
      "npx pr-shepherd stack https://github.com/o/r/pull/1 https://github.com/o/r/pull/2 --once --merge-ready --x",
    );
  });
});
