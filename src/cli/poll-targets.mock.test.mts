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

  it("rejects a malformed PR reference instead of dropping it", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    expect(parsePollTargets(["42", "not-a-pr"])).toBeNull();
    expect(process.exitCode).toBe(EXIT.USAGE);
    expect(stderr.mock.calls.map((call) => call[0]).join("")).toContain(
      'invalid PR reference "not-a-pr"',
    );
    stderr.mockRestore();
  });

  it("rejects the removed --stack flag with a pointer to the stack command", () => {
    expect(parsePollTargets(["42", "--stack", "43"])).toBeNull();
    expect(process.exitCode).toBe(EXIT.USAGE);
  });

  it("rejects cross-repository aggregate input before GitHub I/O", async () => {
    const parsed = parsePollTargets(["acme/widgets#42", "other/widgets#43"])!;
    await expect(resolvePollTargets(parsed)).rejects.toThrow("one repository");
  });

  it("accepts repository references that differ only in case", async () => {
    const parsed = parsePollTargets(["Acme/Widgets#42", "acme/widgets#43"])!;
    await expect(resolvePollTargets(parsed)).resolves.toMatchObject({ prNumbers: [42, 43] });
  });

  it("rejects every --stack spelling", () => {
    expect(parsePollTargets(["--stack"])).toBeNull();
    expect(parsePollTargets(["--stack=42"])).toBeNull();
    expect(process.exitCode).toBe(EXIT.USAGE);
  });

  it("consumes verbose and resolves an empty selector without repository I/O", async () => {
    const parsed = parsePollTargets(["--verbose"])!;
    expect(parsed.extra).toEqual([]);
    await expect(resolvePollTargets(parsed)).resolves.toEqual({ prNumbers: [] });
  });
});
