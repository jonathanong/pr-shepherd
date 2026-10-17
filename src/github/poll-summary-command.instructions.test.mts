import { describe, expect, it } from "vitest";
import { pollCommandFields } from "./poll-summary-command.mts";

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
