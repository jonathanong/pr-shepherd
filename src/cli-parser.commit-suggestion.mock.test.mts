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
// commit-suggestion dispatch
// ---------------------------------------------------------------------------

const APPLIED_RESULT = {
  pr: 42,
  repo: "owner/repo",
  threadId: "t1",
  path: "a.ts",
  startLine: 5,
  endLine: 5,
  author: "alice",
  applied: true as const,
  commitSha: "abc123",
  patch: "--- a/a.ts\n+++ b/a.ts\n@@ -5,1 +5,1 @@\n-old\n+new\n",
  postActionInstruction: "Run `git push` to publish the commit.",
};

const FAILED_RESULT = {
  pr: 42,
  repo: "owner/repo",
  threadId: "t1",
  path: "a.ts",
  startLine: 5,
  endLine: 5,
  author: "alice",
  applied: false as const,
  reason: "git apply rejected the patch: context mismatch",
  patch: "--- a/a.ts\n+++ b/a.ts\n@@ -5,1 +5,1 @@\n-old\n+new\n",
  postActionInstruction: "",
};

const DRY_RUN_VALID_RESULT = {
  pr: 42,
  repo: "owner/repo",
  threadId: "t1",
  path: "a.ts",
  startLine: 5,
  endLine: 5,
  author: "alice",
  applied: false as const,
  dryRun: true as const,
  valid: true,
  reason: null,
  patch: "--- a/a.ts\n+++ b/a.ts\n@@ -5,1 +5,1 @@\n-old\n+new\n",
  postActionInstruction: "Re-run without --dry-run to apply and commit.",
};

const DRY_RUN_INVALID_RESULT = {
  pr: 42,
  repo: "owner/repo",
  threadId: "t1",
  path: "a.ts",
  startLine: 5,
  endLine: 5,
  author: "alice",
  applied: false as const,
  dryRun: true as const,
  valid: false,
  reason: "git apply rejected the patch: context mismatch",
  patch: "--- a/a.ts\n+++ b/a.ts\n@@ -5,1 +5,1 @@\n-old\n+new\n",
  postActionInstruction: "",
};

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

  it("calls runCommitSuggestion with correct args and exits 0 on applied", async () => {
    mockRunCommitSuggestion.mockResolvedValue(APPLIED_RESULT);
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
    expect(process.exitCode).toBe(0);
  });

  it("passes --description when supplied", async () => {
    mockRunCommitSuggestion.mockResolvedValue(APPLIED_RESULT);
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

  it("exits 1 when applied=false", async () => {
    mockRunCommitSuggestion.mockResolvedValue(FAILED_RESULT);
    await main(["node", "shepherd", "commit-suggestion", "--thread-id", "t1", "--message", "fix"]);
    expect(process.exitCode).toBe(1);
  });

  it("text output shows applied result with commit sha and post-action", async () => {
    mockRunCommitSuggestion.mockResolvedValue(APPLIED_RESULT);
    await main(["node", "shepherd", "commit-suggestion", "--thread-id", "t1", "--message", "fix"]);
    const out = getStdout();
    expect(out).toContain("Applied suggestion from @alice:");
    expect(out).toContain("a.ts (line 5)");
    expect(out).toContain("Commit: abc123");
    expect(out).toContain("git push");
  });

  it("text output shows patch diff block in success result", async () => {
    mockRunCommitSuggestion.mockResolvedValue(APPLIED_RESULT);
    await main(["node", "shepherd", "commit-suggestion", "--thread-id", "t1", "--message", "fix"]);
    const out = getStdout();
    expect(out).toContain("```diff");
    expect(out).toContain("--- a/a.ts");
  });

  it("errors when --message is whitespace only", async () => {
    await main(["node", "shepherd", "commit-suggestion", "--thread-id", "t1", "--message", "   "]);
    expect(process.exitCode).toBe(1);
    expect(mockRunCommitSuggestion).not.toHaveBeenCalled();
    const err = stderrSpy.mock.calls.map((c: string[]) => c[0]).join("");
    expect(err).toContain("--message");
  });

  it("text output shows failure with reason and patch", async () => {
    mockRunCommitSuggestion.mockResolvedValue(FAILED_RESULT);
    await main(["node", "shepherd", "commit-suggestion", "--thread-id", "t1", "--message", "fix"]);
    const out = getStdout();
    expect(out).toContain("Failed to apply suggestion t1:");
    expect(out).toContain("git apply rejected");
    expect(out).toContain("--- a/a.ts");
  });

  it("json output serialises the full result", async () => {
    mockRunCommitSuggestion.mockResolvedValue(APPLIED_RESULT);
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
    expect(parsed).toMatchObject({ applied: true, commitSha: "abc123", threadId: "t1" });
  });
});

// ---------------------------------------------------------------------------
// commit-suggestion --dry-run dispatch
// ---------------------------------------------------------------------------

describe("main — commit-suggestion --dry-run", () => {
  it("passes dryRun=true to runCommitSuggestion and does not require --message", async () => {
    mockRunCommitSuggestion.mockResolvedValue(DRY_RUN_VALID_RESULT);
    await main([
      "node",
      "shepherd",
      "commit-suggestion",
      "42",
      "--thread-id",
      "t1",
      "--dry-run",
    ]);
    expect(mockRunCommitSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({ prNumber: 42, threadId: "t1", dryRun: true }),
    );
    expect(process.exitCode).toBe(0);
  });

  it("exits 1 when dry-run valid=false", async () => {
    mockRunCommitSuggestion.mockResolvedValue(DRY_RUN_INVALID_RESULT);
    await main(["node", "shepherd", "commit-suggestion", "--thread-id", "t1", "--dry-run"]);
    expect(process.exitCode).toBe(1);
  });

  it("text output shows dry-run valid header and diff", async () => {
    mockRunCommitSuggestion.mockResolvedValue(DRY_RUN_VALID_RESULT);
    await main(["node", "shepherd", "commit-suggestion", "--thread-id", "t1", "--dry-run"]);
    const out = getStdout();
    expect(out).toContain("Dry-run: would apply suggestion from @alice:");
    expect(out).toContain("a.ts (line 5)");
    expect(out).toContain("```diff");
    expect(out).toContain("Re-run without --dry-run");
  });

  it("text output shows dry-run invalid header and reason", async () => {
    mockRunCommitSuggestion.mockResolvedValue(DRY_RUN_INVALID_RESULT);
    await main(["node", "shepherd", "commit-suggestion", "--thread-id", "t1", "--dry-run"]);
    const out = getStdout();
    expect(out).toContain("Dry-run: suggestion cannot apply cleanly:");
    expect(out).toContain("context mismatch");
    expect(out).toContain("```diff");
  });

  it("errors when --thread-id is omitted even with --dry-run", async () => {
    await main(["node", "shepherd", "commit-suggestion", "--dry-run"]);
    expect(process.exitCode).toBe(1);
    expect(mockRunCommitSuggestion).not.toHaveBeenCalled();
    const err = stderrSpy.mock.calls.map((c: string[]) => c[0]).join("");
    expect(err).toContain("--thread-id");
  });

  it("errors when --message is omitted and --dry-run is NOT set", async () => {
    await main(["node", "shepherd", "commit-suggestion", "--thread-id", "t1"]);
    expect(process.exitCode).toBe(1);
    expect(mockRunCommitSuggestion).not.toHaveBeenCalled();
    const err = stderrSpy.mock.calls.map((c: string[]) => c[0]).join("");
    expect(err).toContain("--message");
  });

  it("json output for dry-run valid includes dryRun and valid fields", async () => {
    mockRunCommitSuggestion.mockResolvedValue(DRY_RUN_VALID_RESULT);
    await main([
      "node",
      "shepherd",
      "commit-suggestion",
      "--thread-id",
      "t1",
      "--dry-run",
      "--format",
      "json",
    ]);
    const out = getStdout();
    const parsed = JSON.parse(out.trim());
    expect(parsed).toMatchObject({ applied: false, dryRun: true, valid: true, reason: null });
  });
});
