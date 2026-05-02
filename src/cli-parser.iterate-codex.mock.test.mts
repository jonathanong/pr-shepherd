import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./commands/check.mts", () => ({ runCheck: vi.fn() }));
vi.mock("./commands/resolve.mts", () => ({
  runResolveFetch: vi.fn(),
  runResolveMutate: vi.fn(),
}));
vi.mock("./commands/commit-suggestion.mts", () => ({
  runCommitSuggestion: vi.fn(),
}));
vi.mock("./commands/iterate.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./commands/iterate.mts")>();
  return { ...actual, runIterate: vi.fn() };
});
vi.mock("./commands/status.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./commands/status.mts")>();
  return {
    ...actual,
    runStatus: vi.fn(),
    formatStatusTable: vi.fn().mockReturnValue("status table"),
  };
});
vi.mock("./github/client.mts", () => ({
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "owner", name: "repo" }),
}));

import { main } from "./cli-parser.mts";
import { runIterate } from "./commands/iterate.mts";
import { runStatus } from "./commands/status.mts";
import { makeIterateResult } from "./cli-parser.iterate-fixtures.mts";

const mockRunIterate = vi.mocked(runIterate);
const mockRunStatus = vi.mocked(runStatus);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let stdoutSpy: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let stderrSpy: any;

function getStdout(): string {
  return stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
}

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
  delete process.env.AGENT;
  delete process.env.CODEX_CI;
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  mockRunStatus.mockResolvedValue([]);
});

afterEach(() => {
  process.exitCode = undefined;
  delete process.env.AGENT;
  delete process.env.CODEX_CI;
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
});

describe("main — iterate Codex fix_code output", () => {
  it("text rewrites next-tick final instruction to reusable iterate command", async () => {
    process.env.AGENT = "codex";
    const result = makeIterateResult("fix_code");
    if (result.action !== "fix_code") throw new Error("unreachable");
    result.fix.instructions = [
      'Commit changed files: `git add <files> && git commit -m "<descriptive message>"`',
      "Stop this iteration — CI needs time to run on the new push before the next tick.",
    ];
    mockRunIterate.mockResolvedValue(result);

    await main(["node", "shepherd", "iterate", "42", "--ready-delay", "15m"]);
    const out = getStdout();
    expect(out).toContain(
      "2. Stop this iteration — CI needs time to run on the new push. Rerun `npx pr-shepherd iterate 42 --ready-delay 15m` later to recheck.",
    );
    expect(out).not.toContain("before the next tick");
  });

  it("json rewrites next-tick final instruction", async () => {
    process.env.CODEX_CI = "1";
    const result = makeIterateResult("fix_code");
    if (result.action !== "fix_code") throw new Error("unreachable");
    result.fix.instructions = [
      "Stop this iteration — CI needs time to run on the new push before the next tick.",
    ];
    mockRunIterate.mockResolvedValue(result);

    await main(["node", "shepherd", "iterate", "42", "--format=json", "--ready-delay", "2h"]);
    const parsed = JSON.parse(getStdout().trimEnd());
    expect(parsed.fix.instructions).toEqual([
      "Stop this iteration — CI needs time to run on the new push. Rerun `npx pr-shepherd iterate 42 --ready-delay 2h` later to recheck.",
    ]);
  });

  it("rewrites no-mutation final instruction for Codex", async () => {
    process.env.AGENT = "codex";
    const result = makeIterateResult("fix_code");
    if (result.action !== "fix_code") throw new Error("unreachable");
    result.fix.instructions = ["End this iteration."];
    mockRunIterate.mockResolvedValue(result);

    await main(["node", "shepherd", "iterate", "42", "--format=json"]);
    const parsed = JSON.parse(getStdout().trimEnd());
    expect(parsed.fix.instructions).toEqual([
      "Stop this iteration. Rerun `npx pr-shepherd iterate 42` later to recheck.",
    ]);
  });
});
