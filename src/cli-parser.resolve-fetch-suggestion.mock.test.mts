import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./commands/check.mts", () => ({ runCheck: vi.fn() }));
vi.mock("./commands/resolve.mts", () => ({
  runResolveFetch: vi.fn(),
  runResolveMutate: vi.fn(),
}));
vi.mock("./commands/commit-suggestion.mts", () => ({ runCommitSuggestion: vi.fn() }));
vi.mock("./commands/iterate.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./commands/iterate.mts")>();
  return { ...actual, runIterate: vi.fn() };
});
vi.mock("./commands/status.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./commands/status.mts")>();
  return { ...actual, runStatus: vi.fn(), formatStatusTable: vi.fn().mockReturnValue("") };
});
vi.mock("./github/client.mts", () => ({
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "owner", name: "repo" }),
}));

import { main } from "./cli-parser.mts";
import { runResolveFetch } from "./commands/resolve.mts";
import { runStatus } from "./commands/status.mts";

const mockRunResolveFetch = vi.mocked(runResolveFetch);
const mockRunStatus = vi.mocked(runStatus);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let stdoutSpy: any;
let stderrSpy: any;

function getStdout(): string {
  return stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
}

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  mockRunStatus.mockResolvedValue([]);
});

afterEach(() => {
  process.exitCode = undefined;
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
});

describe("formatFetchResult — suggestion rendering", () => {
  it("shows parsed suggestion content inline under each [suggestion] bullet", async () => {
    mockRunResolveFetch.mockResolvedValue({
      prNumber: 42,
      actionableThreads: [
        {
          id: "PRT_1",
          path: "src/foo.ts",
          line: 5,
          startLine: null,
          isMinimized: false,
          author: "alice",
          body: "Use const",
          url: "",
          createdAtUnix: 0,
          suggestion: { startLine: 5, endLine: 5, lines: ["const x = 1;"], author: "alice" },
        },
      ],
      resolutionOnlyThreads: [],
      actionableComments: [],
      firstLookThreads: [],
      firstLookComments: [],
      changesRequestedReviews: [],
      reviewSummaries: [],
      commitSuggestionsEnabled: true,
      instructions: ["Classify every item."],
    });
    await main(["node", "shepherd", "resolve", "42"]);
    const out = getStdout();
    expect(out).toContain("[suggestion]");
    expect(out).toContain("Replaces line 5:");
    expect(out).toContain("const x = 1;");
  });

  it("shows multi-line range in bullet when startLine differs from line", async () => {
    mockRunResolveFetch.mockResolvedValue({
      prNumber: 42,
      actionableThreads: [
        {
          id: "PRT_1",
          path: "src/foo.ts",
          line: 42,
          startLine: 40,
          isMinimized: false,
          author: "alice",
          body: "Collapse these",
          url: "",
          createdAtUnix: 0,
          suggestion: { startLine: 40, endLine: 42, lines: ["const x = 1;"], author: "alice" },
        },
      ],
      resolutionOnlyThreads: [],
      actionableComments: [],
      firstLookThreads: [],
      firstLookComments: [],
      changesRequestedReviews: [],
      reviewSummaries: [],
      commitSuggestionsEnabled: true,
      instructions: ["Classify every item."],
    });
    await main(["node", "shepherd", "resolve", "42"]);
    const out = getStdout();
    expect(out).toContain("`src/foo.ts:40-42`");
    expect(out).toContain("Replaces lines 40–42:");
  });
});
