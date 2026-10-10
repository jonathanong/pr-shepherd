import { afterEach, describe, expect, it, vi } from "vitest";
import { main } from "./cli-parser.mts";
import * as config from "./config/load.mts";
import * as logs from "./log/setup.mts";
import { parseCommonArgs } from "./cli/args.mts";
import { validateDefaultPollArgs } from "./cli/default-poll.mts";
import { extractTransportArgs } from "./cli/transport-args.mts";

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});
describe("global CLI transport flag", () => {
  it.each([
    ["--transport", "invalid", "iterate", "--help"],
    ["apply", "review", "--transport=invalid", "-h"],
    ["--transport", "rest", "--help"],
    ["--transport", "--help"],
  ])("short-circuits help before transport validation or I/O for %j", async (...args) => {
    const load = vi.spyOn(config, "loadConfig");
    const setup = vi.spyOn(logs, "setupLog");
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await main(["node", "shepherd", ...args]);
    expect(stdout).toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    expect(setup).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });
  it("parses both flag forms and does not confuse a transport value with a PR", () => {
    expect(parseCommonArgs(["--transport", "rest", "42"]).global.transport).toBe("rest");
    expect(parseCommonArgs(["42", "--transport=graphql"]).global.transport).toBe("graphql");
    expect(parseCommonArgs(["--transport", "rest", "42"]).prNumber).toBe(42);
    expect(validateDefaultPollArgs(["42", "--transport", "rest"])).toBe(true);
  });
  it("preserves flag-looking message text while selecting the actual global transport", () => {
    const args = ["apply", "review", "42", "--message", "--transport=rest", "--transport=graphql"];
    expect(extractTransportArgs(args)).toEqual({
      args: args.slice(0, -1),
      transport: "graphql",
    });
    const parsed = parseCommonArgs(args.slice(2));
    expect(parsed.global.transport).toBe("graphql");
    expect(parsed.extra).toEqual(["--message", "--transport=rest"]);
    expect(
      parseCommonArgs(["42", "--message", "--transport=rest"]).global.transport,
    ).toBeUndefined();
  });
  it("rejects an invalid transport before logging or API access", async () => {
    const setup = vi.spyOn(logs, "setupLog");
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await main(["node", "shepherd", "iterate", "--transport=invalid"]);
    expect(process.exitCode).toBe(64);
    expect(stderr).toHaveBeenCalled();
    expect(setup).not.toHaveBeenCalled();
  });
});
