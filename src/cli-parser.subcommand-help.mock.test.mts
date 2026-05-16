// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./commands/iterate/index.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./commands/iterate/index.mts")>();
  return { ...actual, runIterate: vi.fn() };
});
vi.mock("./commands/check.mts", () => ({ runCheck: vi.fn() }));
vi.mock("./commands/resolve.mts", () => ({
  runResolveFetch: vi.fn(),
  runResolveMutate: vi.fn(),
}));
vi.mock("./commands/commit-suggestion.mts", () => ({ runCommitSuggestion: vi.fn() }));
vi.mock("./commands/clean.mts", () => ({ runClean: vi.fn() }));
vi.mock("./commands/log-file.mts", () => ({ runLogFile: vi.fn() }));
vi.mock("./github/client.mts", () => ({
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "owner", name: "repo" }),
}));

import { main } from "./cli-parser.mts";
import { runIterate } from "./commands/iterate/index.mts";
import { runResolveFetch } from "./commands/resolve.mts";
import { runCommitSuggestion } from "./commands/commit-suggestion.mts";

const mockRunIterate = vi.mocked(runIterate);
const mockRunResolveFetch = vi.mocked(runResolveFetch);
const mockRunCommitSuggestion = vi.mocked(runCommitSuggestion);

let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;

function getStdout(): string {
  return stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
}

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  process.exitCode = undefined;
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
});

const SUBCOMMANDS = [
  "resolve",
  "commit-suggestion",
  "iterate",
  "poll",
  "clean",
  "log-file",
] as const;

for (const sub of SUBCOMMANDS) {
  describe(`${sub} --help / -h`, () => {
    it(`prints usage for '${sub} --help' and exits 0`, async () => {
      await main(["node", "shepherd", sub, "--help"]);
      expect(getStdout()).toContain("Usage:");
      expect(process.exitCode).toBeUndefined();
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it(`prints usage for '${sub} -h' and exits 0`, async () => {
      await main(["node", "shepherd", sub, "-h"]);
      expect(getStdout()).toContain("Usage:");
      expect(process.exitCode).toBeUndefined();
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it(`does not perform real work for '${sub} --help'`, async () => {
      await main(["node", "shepherd", sub, "--help"]);
      expect(mockRunIterate).not.toHaveBeenCalled();
      expect(mockRunResolveFetch).not.toHaveBeenCalled();
      expect(mockRunCommitSuggestion).not.toHaveBeenCalled();
    });
  });
}

describe("default iterate path (pr 123 --help)", () => {
  it("prints iterate usage to stdout and exits 0 for '123 --help'", async () => {
    await main(["node", "shepherd", "123", "--help"]);
    expect(getStdout()).toContain("Usage:");
    expect(process.exitCode).toBeUndefined();
    expect(stderrSpy).not.toHaveBeenCalled();
    expect(mockRunIterate).not.toHaveBeenCalled();
  });

  it("prints iterate usage to stdout and exits 0 for '123 -h'", async () => {
    await main(["node", "shepherd", "123", "-h"]);
    expect(getStdout()).toContain("Usage:");
    expect(process.exitCode).toBeUndefined();
    expect(stderrSpy).not.toHaveBeenCalled();
    expect(mockRunIterate).not.toHaveBeenCalled();
  });
});
