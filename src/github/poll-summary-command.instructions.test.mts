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

  it("carries event mode into row commands and bounded draft probes", () => {
    expect(pollCommandFields("o/r", 7, false, { pollMode: "event" }).pollCommand).toContain(
      "--until-terminal --poll-mode event",
    );
    const probe = pollCommandFields("o/r", 7, true, {
      pollMode: "event",
      noAutoMarkReady: true,
    });
    expect(probe).toMatchObject({ pollProbe: true });
    expect(probe.pollCommand).toContain("--poll-mode event");
    expect(pollCommandFields("o/r", 7, false, { pollMode: "poll" }).pollCommand).not.toContain(
      "--poll-mode",
    );
  });

  it("omits the flag when no style was requested", () => {
    expect(pollCommandFields("o/r", 7, false, {}).pollCommand).not.toContain("--instructions");
  });
});
