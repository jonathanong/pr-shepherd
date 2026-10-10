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
