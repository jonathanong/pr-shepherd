import { vi, beforeEach, afterEach } from "vitest";

vi.mock("../src/commands/check.mts", () => ({ runCheck: vi.fn() }));
vi.mock("../src/commands/resolve.mts", () => ({
  runResolveMutate: vi.fn(),
}));
vi.mock("../src/commands/commit-suggestion.mts", () => ({
  runCommitSuggestion: vi.fn(),
}));
vi.mock("../src/commands/iterate/index.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/commands/iterate/index.mts")>();
  return { ...actual, runIterate: vi.fn() };
});
vi.mock("../src/github/client.mts", () => ({
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "owner", name: "repo" }),
}));

import { main } from "../src/cli-parser.mts";
import { runCommitSuggestion } from "../src/commands/commit-suggestion.mts";

const mockRunCommitSuggestion = vi.mocked(runCommitSuggestion);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let stdoutSpy: any;
let stderrSpy: any;

function getStdout(): string {
  return stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
}

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
    "Resolve the thread on GitHub: `pr-shepherd resolve 42 --resolve-thread-ids t1`",
    "Push when ready: `git push` (or `git push --force-with-lease` after rebasing).",
  ],
};

// ---------------------------------------------------------------------------
// commit-suggestion dispatch
// ---------------------------------------------------------------------------

export function registerHooks(): void {
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
}

export {
  SUGGESTION_RESULT,
  getStdout,
  main,
  mockRunCommitSuggestion,
  runCommitSuggestion,
  stderrSpy,
  stdoutSpy,
};
