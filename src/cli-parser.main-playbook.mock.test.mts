import { describe, it, expect } from "vitest";
import { registerHooks, getStdout } from "../test-helpers/cli-parser.test-support.mts";
import { main } from "./cli-parser.mts";

registerHooks();

describe("main — playbook", () => {
  it("prints a shipped playbook before any log setup", async () => {
    await main(["node", "shepherd", "playbook", "Triage loop"]);
    expect(getStdout()).toContain("# Triage loop");
  });

  it("honors --help", async () => {
    await main(["node", "shepherd", "playbook", "--help"]);
    expect(getStdout()).toContain("pr-shepherd playbook");
  });
});
