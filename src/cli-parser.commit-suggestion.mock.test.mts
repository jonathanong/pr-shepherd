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
import { runCommitSuggestion } from "./commands/commit-suggestion.mts";
import { runStatus } from "./commands/status.mts";

const mockRunCommitSuggestion = vi.mocked(runCommitSuggestion);
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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SUGGESTION_RESULT = {
  pr: 42,
  repo: "owner/repo",
  threadId: "t1",
  path: "a.ts",
  startLine: 5,
  endLine: 5,
  author: "alice",
  patch: "--- a/a.ts\n+++ b/a.ts\n@@ -5,1 +5,1 @@\n-old\n+new\n",
  commitMessage: "apply fix",
  commitBody: "Co-authored-by: alice <alice@users.noreply.github.com>",
  filesToStage: ["a.ts"],
  postActionInstructions: [
    "Apply the patch to `a.ts`: run `git apply` with the diff shown above.",
    "Stage the file: `git add -- a.ts`",
    'Commit: `git commit -m "apply fix" -m "Co-authored-by: alice <alice@users.noreply.github.com>"`',
    "Resolve the thread on GitHub: `npx pr-shepherd resolve 42 --resolve-thread-ids t1`",
    "Push when ready: `git push` (or `git push --force-with-lease` after rebasing).",
  ],
};

// ---------------------------------------------------------------------------
// commit-suggestion dispatch
// ---------------------------------------------------------------------------

describe("main — commit-suggestion", () => {
  it("errors when --thread-id is omitted", async () => {
    await main(["node", "shepherd", "commit-suggestion", "42", "--message", "fix"]);
    expect(process.exitCode).toBe(1);
    expect(mockRunCommitSuggestion).not.toHaveBeenCalled();
    const err = stderrSpy.mock.calls.map((c: string[]) => c[0]).join("");
    expect(err).toContain("--thread-id");
  });

  it("errors when --message is omitted", async () => {
    await main(["node", "shepherd", "commit-suggestion", "42", "--thread-id", "t1"]);
    expect(process.exitCode).toBe(1);
    expect(mockRunCommitSuggestion).not.toHaveBeenCalled();
    const err = stderrSpy.mock.calls.map((c: string[]) => c[0]).join("");
    expect(err).toContain("--message");
  });

  it("errors when --message is whitespace only", async () => {
    await main(["node", "shepherd", "commit-suggestion", "--thread-id", "t1", "--message", "   "]);
    expect(process.exitCode).toBe(1);
    expect(mockRunCommitSuggestion).not.toHaveBeenCalled();
    const err = stderrSpy.mock.calls.map((c: string[]) => c[0]).join("");
    expect(err).toContain("--message");
  });

  it("calls runCommitSuggestion with correct args and exits 0 on success", async () => {
    mockRunCommitSuggestion.mockResolvedValue(SUGGESTION_RESULT);
    await main([
      "node",
      "shepherd",
      "commit-suggestion",
      "42",
      "--thread-id",
      "t1",
      "--message",
      "apply fix",
    ]);
    expect(mockRunCommitSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({ prNumber: 42, threadId: "t1", message: "apply fix" }),
    );
    expect(process.exitCode).toBeUndefined();
  });

  it("passes --description when supplied", async () => {
    mockRunCommitSuggestion.mockResolvedValue(SUGGESTION_RESULT);
    await main([
      "node",
      "shepherd",
      "commit-suggestion",
      "--thread-id",
      "t1",
      "--message",
      "fix",
      "--description",
      "more detail",
    ]);
    expect(mockRunCommitSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({ description: "more detail" }),
    );
  });

  it("text output shows suggestion header with author and thread id", async () => {
    mockRunCommitSuggestion.mockResolvedValue(SUGGESTION_RESULT);
    await main(["node", "shepherd", "commit-suggestion", "--thread-id", "t1", "--message", "fix"]);
    const out = getStdout();
    expect(out).toContain("Suggestion from @alice");
    expect(out).toContain("PR #42");
    expect(out).toContain("thread t1");
    expect(out).toContain("a.ts (line 5)");
  });

  it("text output shows patch diff block", async () => {
    mockRunCommitSuggestion.mockResolvedValue(SUGGESTION_RESULT);
    await main(["node", "shepherd", "commit-suggestion", "--thread-id", "t1", "--message", "fix"]);
    const out = getStdout();
    expect(out).toContain("```diff");
    expect(out).toContain("--- a/a.ts");
  });

  it("text output shows ## Suggested commit message section", async () => {
    mockRunCommitSuggestion.mockResolvedValue(SUGGESTION_RESULT);
    await main(["node", "shepherd", "commit-suggestion", "--thread-id", "t1", "--message", "fix"]);
    const out = getStdout();
    expect(out).toContain("## Suggested commit message");
    expect(out).toContain("apply fix");
    expect(out).toContain("Co-authored-by:");
  });

  it("text output shows ## Instructions with numbered steps", async () => {
    mockRunCommitSuggestion.mockResolvedValue(SUGGESTION_RESULT);
    await main(["node", "shepherd", "commit-suggestion", "--thread-id", "t1", "--message", "fix"]);
    const out = getStdout();
    expect(out).toContain("## Instructions");
    expect(out).toContain("1. Apply the patch");
    expect(out).toContain("2. Stage");
    expect(out).toContain("3. Commit");
  });

  it("json output serialises the full result", async () => {
    mockRunCommitSuggestion.mockResolvedValue(SUGGESTION_RESULT);
    await main([
      "node",
      "shepherd",
      "commit-suggestion",
      "--thread-id",
      "t1",
      "--message",
      "fix",
      "--format",
      "json",
    ]);
    const out = getStdout();
    const parsed = JSON.parse(out.trim());
    expect(parsed).toMatchObject({
      threadId: "t1",
      commitMessage: "apply fix",
      filesToStage: ["a.ts"],
    });
  });
});
