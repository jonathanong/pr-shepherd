import { describe, it, expect } from "vitest";
import { registerHooks, stderrSpy } from "../test-helpers/cli-parser.test-support.mts";
import { main } from "./cli-parser.mts";

registerHooks();

describe("main — unknown subcommand", () => {
  it("writes error to stderr and exits 1", async () => {
    await main(["node", "shepherd", "unknown-command"]);
    const stderrOutput = stderrSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
    expect(stderrOutput).toContain("Unknown subcommand");
    expect(process.exitCode).toBe(1);
  });
});
