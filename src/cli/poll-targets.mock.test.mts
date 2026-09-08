import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../github/client.mts", () => ({
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "acme", name: "widgets" }),
}));

import { EXIT } from "../exit-codes.mts";
import { parsePollTargets, resolvePollTargets } from "./poll-targets.mts";

beforeEach(() => {
  process.exitCode = undefined;
});

describe("poll target parsing", () => {
  it("deduplicates PRs in input order and preserves poll flags", async () => {
    const parsed = parsePollTargets([
      "42",
      "acme/widgets#43",
      "42",
      "--interval",
      "30s",
      "--format=json",
    ])!;
    expect(parsed.extra).toEqual(["--interval", "30s"]);
    await expect(resolvePollTargets(parsed)).resolves.toEqual({
      prNumbers: [42, 43],
      targetRepository: { owner: "acme", name: "widgets" },
    });
  });

  it("parses a native stack anchor and rejects mixed selectors", async () => {
    const parsed = parsePollTargets(["--stack", "acme/widgets#43", "--debounce=0"])!;
    expect(parsed.extra).toEqual(["--debounce=0"]);
    await expect(resolvePollTargets(parsed)).resolves.toEqual({
      prNumbers: [],
      stackPrNumber: 43,
      targetRepository: { owner: "acme", name: "widgets" },
    });
    expect(parsePollTargets(["42", "--stack", "43"])).toBeNull();
    expect(process.exitCode).toBe(EXIT.USAGE);
  });

  it("rejects cross-repository aggregate input before GitHub I/O", async () => {
    const parsed = parsePollTargets(["acme/widgets#42", "other/widgets#43"])!;
    await expect(resolvePollTargets(parsed)).rejects.toThrow("one repository");
  });

  it("validates separate and inline stack selectors", () => {
    expect(parsePollTargets(["--stack"])).toBeNull();
    expect(parsePollTargets(["--stack=bad"])).toBeNull();
    expect(parsePollTargets(["--stack=42", "--stack=43"])).toBeNull();
    expect(parsePollTargets(["--stack", "42", "--stack", "43"])).toBeNull();
    expect(process.exitCode).toBe(EXIT.USAGE);
  });

  it("consumes verbose and resolves an empty selector without repository I/O", async () => {
    const parsed = parsePollTargets(["--verbose"])!;
    expect(parsed.extra).toEqual([]);
    await expect(resolvePollTargets(parsed)).resolves.toEqual({ prNumbers: [] });
  });
});
